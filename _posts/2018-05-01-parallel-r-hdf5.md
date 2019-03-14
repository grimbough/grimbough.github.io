---
redirect_from: "/2018/05/01/parallel-r-hdf5/"
layout: single
title: Parallel processing with R and HDF5
---

I just got back from a great week at the CZI meeting/workshop/hackathon to mark the start of the ‘Collaborative Computational Tools for the Human Cell Atlas’ project. One topic that came up frequently was the suitability of various file formats for storing single-cell data. Of particular interest to me was whether it is practical (or indeed possible) to perform parallel processing on data stored in HDF5 files from within R.


I think this quote in the user guide to Loompy (which uses HDF5) sums up the ambiguity people were feeling:

> “Loom files do support concurrent reads, but only from separate processes (not threads), and (we think) only from a single compute node. On a compute cluster, you may encounter bugs if you try to read the same Loom file from different compute nodes concurrently.”

It’s a bit vague and non-committal, with an implicit assumption that anyone interested this will know the difference between a process and a thread (and which their favourite language/software uses). It’s also a potential deal breaker on using HDF5 as a file format as the size of single-cell datasets continue to grow. So during the meeting I sat down with [@KasperDHansen](https://twitter.com/KasperDHansen) to achieve some clarity – code up a simple example in R and it’ll either work or crash horribly; either way we can say something definitive.

Short answer – parallel reading works without issue on both a multi-core shared memory environment and an HPC cluster across several nodes. Awesome!

Keep reading for a more comprehensive discussion with some examples and benchmarks based on what we did at the meeting.

## Hardware

Since so much of bench marking is dependant on the hardware it’s run on, I’ve tried to record some pertinant details of the two machine the example below were run on. I’m always happy to take advice on what else should be here – real world peak transfer rate of the disks seems like something I should record for example.

| 	| Desktop	| Workstation |
|CPU |	Intel Core i5 CPU 750	| Intel Xeon E7 - 4870 |
|No. Cores |	4	| 80 |
|CPU Speed (GHz) | 2.67 |	2.40 |
|Disk	| WDC 1TB / 7000RPM / SATA3.0 |	?? |

## Data creation

The code below will create a 30,000 × 20,000 matrix filled with random integers and write it to a dataset called counts in an HDF5. Note the chunk size of 100 × 100, it’s an arbitrary choice but we’ll reference this later.

*This process requires ≈4.5GB of ram during the matrix creation – if that’s a problem you can always make a matrix with fewer entries. You can also change the file name if you want it to be easier to find or persist between sessions.*

```r
library(HDF5Array)
library(rhdf5)
library(DelayedMatrixStats)
library(parallel)

## create a 30,000 x 20,000 matrix filled with random integers
set.seed(54321)
data_matrix <- matrix(sample.int(size = 6e8, n = 100, replace = TRUE), 
                      nrow = 30000)

## create an empty HDF5 file
h5File <- tempfile(fileext = '.hdf5')
if(file.exists(h5File)) 
    file.remove(h5File)
h5createFile(h5File)

## create dataset to hold our matrix
h5createDataset(file = h5File, 
                dataset = "counts", 
                dims = dim(data_matrix), 
                chunk = c(100,100),
                level = 3, 
                storage.mode = "integer", 
                H5type = "H5T_STD_I32LE")

## write matrix to file
h5write( data_matrix, 
         file = h5File, 
         name = "counts")

## create an HDF5Array pointing to our on disk representation
h5matrix <- HDF5Array(filepath = h5File, name = 'counts')
```

## Serial calculation

First we’ll use colSums2() from the DelayedMatrixStats package to calculate the sum of all 20,000 columns and record how long it takes. This will be our baseline time for comparison purposes.

```r
system.time(
    DelayedMatrixStats::colSums2(h5matrix, cols = 1:20000)
)
```

```
user  system elapsed
14.068   1.032  15.102
```

## Naïve `lapply()`

Now we have a baseline, lets think about how we’ll parallelise this. Eventually the intention is to use mclapply(), which will require a little reformatting from what we did above. Before getting to that stage we’ll transform our call into one using regular lapply() . The example below gives one way of doing this, using lapply() to pass the index of the column we want to sum. Note: we’re only using 1% of the columns in this example – look at the time taken.

```r
system.time(
lapply(1:200, FUN = function(i, x) {
        DelayedMatrixStats::colSums2(x = x, cols = i) 
    },
    x = h5matrix)
)
```

```
user  system elapsed
20.516   0.272  20.783
```

Unfortunately this is incredibly slow! Using this approach takes longer to calculate over 200 columns than the original approach took over all 20,000 – clearly something is wrong. Some of the slowdown comes from overhead in dispatching `colSums2()` 200 times rather than just once. However the main problem is that using `lapply()` in this fashion means each column is read and summed separately. When working in memory this isn’t really a problem, but due to the way HDF5 files are stored in chunks on disk it means each column is read from disk 100 times but only used once. That factor of 100 is due to the chunk size we specified during the file creation; if the chunk size were larger the slowdown would be even greater. Combine the two issues and you can see why this is over 100 times slower than the standard approach.

## Improved lapply()

It’s much better to construct the lapply() call so that each internal call reads an entire HDF5 chunk (100 columns in our case). The example below now works over the full 20,000 columns, dispatching 200 calls to colSums2() each of which processes 100 sequential columns.

```r
system.time(
lapply(seq(1, 20000, by = 100), FUN = function(i, x) {
        DelayedMatrixStats::colSums2(x = x, cols = i:(i+99))
    },
    x = h5matrix)
)
```

```
user  system elapsed
22.280   0.864  23.604
```

You can see this is pretty close to 100 times faster (similar time, 100 times more columns) than the naïve approach, as we’d expect given each chunk is only being read once rather than one hundred times. However it’s still slower than our original run outside the call to lapply(). We can improve this by reducing the number of values passed to lapply() and increasing the number of columns processed in each call. Here we increase the number of columns in each call to 1000.

```r
system.time(
lapply(seq(1, 20000, by = 1000), FUN = function(i, x) {
        DelayedMatrixStats::colSums2(x = x, cols = i:(i+999))
    },
    x = h5matrix)
)
```

```
user  system elapsed
14.784   1.020  15.805
```

Now we’re very close to that original time – 15.1 sec vs 15.8 sec – which feels like it’s getting towards the margin of error in our timing approach. Taking this to the extreme we’d only call colSums2() once and it would be the same as our first approach wrapped in an lapply() , but it wouldn’t be appropriate for the parallelisation we’re going to explore next.

## Parallel calculations

### Using `mclapply()`

We use the `mclapply()` in the parallel package to experiment with parallel reads. To do this it’s as simple as replacing our call to lapply() with mclapply(). We also the provide the argument mc.cores = 2 to be explicit about the number of processor cores we want to utilise.

```r
ibrary(parallel)
system.time(
mclapply(seq(1, 20000, by = 1000), FUN = function(i, x) {
        DelayedMatrixStats::colSums2(x = x, cols = i:(i+999))
    },
    x = h5matrix, mc.cores = 2)
)
```

```
 user  system elapsed
  0.148   0.084   8.473
```

It’s not quite twice as fast as the 15.8 seconds for our single-core approach, but it’s pretty close, and more importantly the rhdf5 library didn’t throw any errors regarding already open file handles or similar. We can also try scaling up to use all four cores on my desktop machine.

```r
library(parallel)
system.time(
mclapply(seq(1, 20000, by = 1000), FUN = function(i, x) {
        DelayedMatrixStats::colSums2(x = x, cols = i:(i+999))
    },
    x = h5matrix, mc.cores = 4)
)
```

```
user  system elapsed
11.632   1.592   4.684
```

Again the improvement is almost linear; it seems that at these relatively low numbers of cores processing power is the bottleneck rather than disk I/O.

Here’s a visual representation of the timings show previously. I’ve also included a reading for using 3 cores (6.022 seconds) not shown above. This is pretty crude, with no repeated measurements, but it seems clear that there is a significant increase in performance when making use of the four cores available on my desktop computer.

## Scaling up

Given that there still seems to be potential for speedup at four cores, we wanted to try this on a larger machine. The following example tests the improvement using up to 30 cores. Rather than creating our own counts matrix, it uses the data available in the TENxBrainData package, and calculates the sum on the first 100,000 columns.

I’ve reformatted the code a little to make it fit more succinctly into the microbenchmark format, but it’s essentially working in the same way as before.

```r
## load packages
library(HDF5Array)
library(rhdf5)
library(TENxBrainData)
library(DelayedMatrixStats)
library(parallel)
 
## use TenX data as our counts matrix
tenx <- TENxBrainData::TENxBrainData()
h5matrix <- counts(tenx)
 
## define the funtion we'll use inside mclapply()
par_colSums <- function(i, x) {
    DelayedMatrixStats::colSums2(x = x, cols = i:(i+999))
}
## this is the index we'll pass to mclapply - 1000 entries
lapply_idx <- seq(1, 100000, by = 1000)
 
## define functions for using between 1 and 30 cores
## doing it like this makes the microbenchmark output neater
mc1 <-  function() { mclapply(lapply_idx, FUN = par_colSums, x = h5matrix, mc.cores = 1) }
mc2 <-  function() { mclapply(lapply_idx, FUN = par_colSums, x = h5matrix, mc.cores = 2) }
mc5 <-  function() { mclapply(lapply_idx, FUN = par_colSums, x = h5matrix, mc.cores = 5) }
mc10 <- function() { mclapply(lapply_idx, FUN = par_colSums, x = h5matrix, mc.cores = 10) }
mc15 <- function() { mclapply(lapply_idx, FUN = par_colSums, x = h5matrix, mc.cores = 15) }
mc20 <- function() { mclapply(lapply_idx, FUN = par_colSums, x = h5matrix, mc.cores = 20) }
mc25 <- function() { mclapply(lapply_idx, FUN = par_colSums, x = h5matrix, mc.cores = 25) }
mc30 <- function() { mclapply(lapply_idx, FUN = par_colSums, x = h5matrix, mc.cores = 30) }
```

We can then run the benchmark using the microbenchmark package. Here we run each function 5 times to try and ensure that if there is any disk caching or similar this wont effect one condition unduly. After the benchmark has run we do some processing on the output to calculate the speedup and neaten the data for passing to ggplot2.

```r
library(microbenchmark)
library(dplyr)
library(stringr)
library(lubridate)
 
## run benchmark
bm <- microbenchmark(mc1(), mc2(), mc5(), mc10(),
                     mc15(), mc20(), mc25(), mc30(),
                     times = 5, unit = "s",
                     control = list(warmup = 0))
 
## process the benchmark results to extract ncores
## find the mean of the single-core run and use this
## to compute the speedup
res <- bm %>%
    mutate(ncores = str_extract(expr, "[0-9]+")) %>%
    group_by(ncores) %>%
    mutate(baseline = mean(time)) %>%
    ungroup() %>%
    mutate(ncores = as.integer(ncores),
           speedup = max(baseline) / time,
           time = nanoseconds(time))
```

Here’s a plot showing the time taken and speedup from the benchmark above, similar to what was show before but with multiple runs over each parameter. As the number of cores increase it perhaps doesn’t scale quite as well as when only looking at 1-4, but there’s a clear improvement all the way up to 25 cores. After that it flattens out and there seems to be no benefit in pushing to 30 cores (if anything performance degrades or is at least more erratic). Presumably this is the point where I/O becomes rate limiting, that’s a lot more processor cores than I would have predicted.



## Conclusion

Put simply, this worked far better than I expected. There were no modifications required to the rhdf5 library, nor convoluted ways of opening HDF5 files and passing file handles between processes. In fact there was very little R code required at all. Simply using the existing functionality in DelayedMatrixStats that can operate on HDF5 backed matrices, and combining with `mclapply()` worked out of the box – this is great! I suspect we would see similar behaviour if we dropped in the `colSum()` function from DelayedArray instead.

Ensuring you access the HDF5 file in a way that respects the chunk size on disk is key. Certainly you want to read at least one chunk with each operation, and preferably your operations would exactly match the chunk boundaries – otherwise there will always be unnecessary reading and decompression of data which will dramatically slow things down. This is something the authors of DelayedMatrixStats and DelayedArray will have already considered in their functions, but when transforming to use `mclapply()` the onus is on you to optimise this.

Of course not all calculation are as embarrassingly parallel as calculating the column sums, but as a proof of principle this neatly demonstrates parallel computation on data stored in an HDF5 is both possible and yields substantial benefits when scaling up in the range of cores typically found in desktop computers.



