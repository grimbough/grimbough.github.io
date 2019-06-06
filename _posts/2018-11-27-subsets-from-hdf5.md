---
redirect_from: "/2018/11/27/subsets-from-hdf5/"
title: Exploring performance when extracting subsets from HDF5
tags:
    - r
    - hdf5
    - parallel processing
---

One of the cool features about the HDF5 file format is the ability to read subsets of the data without (necessarily) having to read the entire file, keeping both the memory usage and execution times of these operations to a minimum. However this is not always as performant as one might hope. This may be due to bottlenecks when working with data on-disk rather than in memory, or idiosyncrasies in either the HDF5 library itself or the rhdf5 package. Here we investigate some of the possible bottlenecks.


To demonstrate we’ll create some example data. This takes the form of a matrix with 100 rows and 20,000 columns, where the content of each column is the index of the column i.e. column 10 contains the value 10 repeated, column 20 contains 20 repeated etc. This is just so we can easily check we’ve extracted the correct columns. We then write this matrix to an HDF5 file, calling the dataset ‘counts’. You’ll probably see a warning here regarding chunking, something we’ll touch on later.

```r
m1 <- matrix(rep(1:20000, each = 100), ncol = 20000, byrow = FALSE)
ex_file <- tempfile(fileext = ".h5")
h5write(m1, file = ex_file, name = "counts", level = 6)
```

## Using the index argument

Now we’ll use the index argument to selectively extract the first 10,000 columns and time how long this takes.

```r
system.time(
  res1 <- h5read(file = ex_file, name = "counts", 
                 index = list(NULL, 1:10000))
)
```

```
##    user  system elapsed 
##   0.037   0.000   0.036
```

Next, instead of selecting 10,000 consecutive columns we’ll ask for every other column. This should still return the same amount of data and since our dataset is not chunked involves reading the same volume from disk.

```r
index <- list(NULL, seq(from = 1, to = 20000, by = 2))
system.time(
  res2 <- h5read(file = ex_file, name = "counts", 
                 index = index)
)
```

```
##    user  system elapsed 
##   7.572   0.000   7.572
```

As we can see this is massively slower than the previous example. This is because creating unions of hyperslabs is currently very slow in HDF5 (see Union of non-consecutive hyperslabs is very slow for another report of this behaviour), with the performance penalty increasing exponentially relative to the number of unions. When we use the index argument rhdf5 creates a hyperslab for each disjoint set of values we want to extract and then merges them. In our first example this only require the creation of a single 100 × 10,000 hyperslab, where as in the second case we require 10,000 hyperslabs of dimension 100 × 1 and 9,999 merge operations.

The following plot shows the time taken to select 10,000 columns with varying numbers of union operations required to make the selection. No read operations are performed here, this is purely the time to open the file and create the hyperslab. We can see the very little performance penalty until 100 union operations are required, after this the performance penalty increases exponentially.

## Using hyperslab selections

If there is a regular pattern to the regions you want to access, then it is likely you could also apply use HDF5’s hyperslab selection method. The following code defines the parameters to select every other column, the same as in our previous example. The parameters for defining hyperslab selection start, stride, block, & count are not particularly intuitive if you are used to R’s index selection methods. More examples discussing how to specify them can be found at www.hdfgroup.org.

```r
start <- c(1,1)
stride <- c(1,2)
block <- c(100,1)
count <- c(1,10000)
system.time(
  res3 <- h5read(file = ex_file, name = "counts", start = start,
                 stride = stride, block = block, count = count)
)
```

```
##    user  system elapsed 
##   0.122   0.004   0.126
```

```r
identical(res2, res3)
```

```
## [1] TRUE
```

This is clearly significantly quicker than the 7.5 seconds needed when using the index argument in the example, and the call to `identical()` confirms we’re returning the same data.

rhdf5 is sophisticated enough to combine consecutive columns into a single call, so selecting completely disjoint alternative columns represents a worst case scenario. The impact would be far less if, for example, we wanted to extract columns 1 – 5,000 and 6,001 – 11,000. Based on the benchmarks above, in that scenario it would not be noticeably advantageous to move away from using the index argument, but for less contiguous selections making use of the hyperslab selection parameters can be extremely beneficial.

## Irregular selections

If there isn’t a regular pattern to the columns you want to select, what are the options? Perhaps the most obvious thing we can try is to skip the use of either index or the hyperslab parameters and use 10,000 separate read operations instead. Below we choose a random selection of columns and then apply the function `f1()` to each in turn.

```r
set.seed(1234)
columns <- sample(x = seq_len(20000), size = 10000, replace = FALSE) %>%
  sort()

f1 <- function(cols, name) { 
  h5read(file = ex_file, name = name, 
         index = list(NULL, cols))
}
system.time(
  res4 <- vapply(X = columns, FUN = f1, 
                 FUN.VALUE = integer(length = 100), 
                 name = 'counts')
)
```

```
##    user  system elapsed 
## 132.044   0.524 132.647
``` 

This is clearly a terrible idea, it takes ages! For reference, using the index argument with this set of columns takes 1.425 seconds. This poor performance is driven by two things:

1. Our dataset had no chunking applied to it when it was created. This means for each access the entire dataset is read from disk, which we end up doing 10,000 times.
2. rhdf5 does a lot of validation on the objects that are passed around internally. Within a call to `h5read()` HDF5 identifiers are created for the file, dataset, file dataspace, and memory dataspace, each of which are checked for validity. This overhead is negligible when only one call to `h5read()` is made, but become significant when we make 10,000 separate calls.

There’s not much more you can do if the dataset is not chunked, and using the index argument is reasonable. However storing data in this format defeats of of HDF5’s key utilities, namely rapid random access. As such it’s probably fairly rare to encounter datasets that aren’t chunked. With this in mind we’ll create a new dataset in our file, based on the same matrix but this time split into 100 × 100 chunks.

```r
h5createDataset(file = ex_file, dataset = "counts_chunked", 
                dims = dim(m1), storage.mode = "integer", 
                chunk = c(100,100), level = 6)
h5write(obj = m1, file = ex_file, name = "counts_chunked")
```

If we rerun the same code, but reading from the chunked datasets we get an idea for how much time is wasted extracting the entire dataset over and over.

```r
system.time(
  res5 <- vapply(X = columns, FUN = f1, 
                 FUN.VALUE = integer(length = 100), 
                 name = 'counts_chunked')
)
```

```
##    user  system elapsed 
##  64.962   0.388  65.507
```

This is still quite slow, and the remaining time is being spent on the overheads associated with multiple calls to `h5read()`. To reduce these the function `f2()` defined below splits the list of columns we want to return into sets grouped by the parameter block_size. This is not the greatest function ever, things like the file name are hardcoded out of sight, but it illustrates the technique. In the default case this means any columns between 1 & 100 will be read together, then any between 101 & 200, etc. We then lapply our previous `f1()` function over these groups. The effect here is to reduce the number of calls to `h5read()`, while keeping the number of hyperslab unions down by not having too many columns in any one call.

```r
f2 <- function(block_size = 100) {
  cols_grouped <- split(columns,  (columns-1) %/% block_size)
  res <-  lapply(cols_grouped, f1, name = 'counts_chunked') %>%
    do.call('cbind', .)
}
system.time(f2())
```

```
##    user  system elapsed 
##   1.486   0.012   1.501
```

We can see this has a significant effect, although it’s still an order of magnitude slower than when we were dealing with regularly spaced subsets. The efficiency here will vary based on a number of factors including the size of the dataset chunks and the sparsity of the column index, and you varying the block_size argument will produce differing performances. The plot below shows the timings achieved by providing a selection of values to block_size. It suggests the optimal parameter in this case is probably a block size of 2000, which took 0.24 seconds – noticeably faster than when passing all columns to the index argument in a single call.

## Summary

Efficiently extracting arbitrary subsets of a HDF5 dataset with rhdf5 is a balancing act between the number of hyperslab unions, the number of calls to `h5read()`, and the number of times a chunk is read. For a (mostly) contiguous subset using the index argument is sufficient, while for regularly spaced but disjoint subsets the hyperslab selection parameters offer an efficient, if slightly more complex, alternative. Otherwise finding the optimal strategy may involve some experimentation in a similar fashion to we have seen above.


