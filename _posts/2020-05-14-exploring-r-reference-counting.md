---
title: Exploring R Reference Counting
tags:
    - R
---

One of the major changes in R 4.0.0 is the use of reference counting to keep track of objects in memory. Here we explore how that might benefit users.

The [CRAN NEWS](https://cran.r-project.org/doc/manuals/r-devel/NEWS.html) accompanying R 4.0.0 included the following statement:

> Reference counting is now used instead of the NAMED mechanism for determining when objects can be safely mutated in base C code. This reduces the need for copying in some cases and should allow further optimizations in the future.

We're going to take a look at one concrete example where this change removes the need for unnecessary copying.  *Note: some of the steps below will work differently if you run them in RStudio compared to a plain R session. This is because of how RStudio keeps track of objects in order show you them in the Environment pane*.

## Example code

First lets create a new vector `a` with five random integers as our start point.

```r
set.seed(1)
a <- sample(1:10L, 5)
```

Now we use the `tracemem()` function to mark `a`.  The immediate result of this is the location of `a` in memory being printed to screen ("`0x563f34dcca88`" represents the location).  *Note: You may need to compile R with support for memory profiling to use* `tracemem()`*.  More details can be found at [https://developer.r-project.org/memory-profiling.html](https://developer.r-project.org/memory-profiling.html)*

```r
tracemem(a)
#> [1] "<0x563f34dcca88>"
```

Marking an object with `tracemem()` also has the consequence of that if the tagged object is copied or coerced to a different type a message will be printed to screen.  Let's test this by changing a the first element of `a` for a different integer:

```r
a[1] <- 2L
```

In this case nothing is printed to screen.  This is because R is able to operated 'in-place' swapping the value of the first element without needing to make a copy of the whole vector.  Now we'll try changing an element to a double instead:

```r
a[2] <- 5.5
#> tracemem[0x563f34dcca88 -> 0x563f33b63968]: 
```

This time we can see the `tracemem` message is triggered.  This makes sense, as mixing integers and doubles in a single vector is not allowed by R, so inserting a double into our existing integer vector requires all elements of `a` be coerced to doubles too.  This needs twice as much memory, and so `a` is copied to a new location and our message is printed.  Here `0x563f34dcca88 -> 0x563f33b63968` indicates the previous memory location followed by where is has moved to.

Now lets create a new variable, `b`, and assign it our existing `a` variable.  There's no message printed here, indicating `a` hasn't been modified.  We then use `tracemem()` on `b`, to begin tracking that too.  

```r
b <- a
tracemem(b)
#> [1] "<0xx563f33b63968>"
```

Note that the current location of `b` is `0xx563f33b63968`, which is the same as where `a` was moved to in the previous step.  This demonstrates how R can have multiple variables pointing to the same memory location.  Having established that `a` and `b` are identical and actually reference exactly the same block of memory, let's now change an element of `a`. 

```r
a[3] <- 6.2
#> tracemem[0x563f33b63968 -> 0x563f33b63ab8]: 
```

This triggers another copying , as `a` and `b` are no longer identical and so can't utilise the same memory.  From what we've seen so far the variables `a` and `b` are in the same situation as if they had been created completely independently; they contain different values and point to different memory locations.  We established at the start that in these circumstances R is able to perform in-place substitution of values without requiring the whole vector be copied.  

We've now reached the point where the behaviour of R 3.6.3 and R 4.0.0 differ. 

### R 3.6.3

Let's modify a single value in both `a` and `b`.

```r
a[1] <- 17.0
b[1] <- 17.0
#> tracemem[0x563f33b63968 -> 0x563f33b63d58]: 
```

We see that this works as expected for `a`, but `b` is copied before being modified, even though this is necessary as it's the only variable in our R session that points to this memory location.

### R 4.0.0

With R 4.0.0 the situation is different.  R is able to keep track of the number of references and is aware that now only `b` points to it's particular memory location.  If we modify a single element here, it's is able to do this in-place, just as if `b` was a freshly created variable that had never been related to `a`.

```r
a[1] <- 17.0
b[1] <- 17.0
```

## Does this matter?

This might seem like a convoluted example, and for a our really small vectors it makes no discernible difference.  However, consider the example below why the common strategy of using something like `x <- y <- integer(length = 10)` to preallocate two vectors to be populated in a loop leads to both being copied in R 3.6.3.

```r
x <- y <- integer(length = 10)
tracemem(x)
#> [1] "<0x55e03bc1aee8>"
tracemem(y)
#> [1] "<0x55e03bc1aee8>"
for(i in seq_along(x)) { 
    x[i] <- as.integer(i)
    y[i] <- as.integer(10-i)
}
#> tracemem[0x55e03bc1aee8 -> 0x55e03c94d0b8]: 
#> tracemem[0x55e03bc1aee8 -> 0x55e03c94d048]:
```

There are clearly better ways to create `x` & `y` in this particular case using vectorised functions.  It would also be better to allocate the two variables independently in the first line rather than together, but the point stands that the second copying doesn't need to take place, and in R 4.0.0 that's exactly what happens.

The function below explores this a bit further, by creating a two much larger vectors and then modifying only a small number of positions.  The vast majority of the time taken running this function will be spent on memory allocation, rather than any other operations.  We then benchmark the runtime and memory usage with the [bench](https://cran.r-project.org/package=bench) package.

```r
f <- function() {
    x <- y <- integer(length = 10e7)
    for(i in sample(length(x), size = 10)) { 
        x[i] <- as.integer(i)
        y[i] <- as.integer(length(x)-i)
    }
}

bench::mark(f(), iterations = 10)
```

The bench mark results for both R 3.6.3 and R 4.0.0 are shown below:

```
## R 3.6.3
# A tibble: 1 x 13
  expression   min median `itr/sec` mem_alloc `gc/sec` n_itr  n_gc total_time
  <bch:expr> <bch> <bch:>     <dbl> <bch:byt>    <dbl> <int> <dbl>   <bch:tm>
1 f()        621ms  670ms      1.49    1.12GB     3.98     3     8      2.01s
# … with 4 more variables: result <list>, memory <list>, time <list>, gc <list>

## R 4.0.0
# A tibble: 1 x 13
  expression   min median `itr/sec` mem_alloc `gc/sec` n_itr  n_gc total_time
  <bch:expr> <bch> <bch:>     <dbl> <bch:byt>    <dbl> <int> <dbl>   <bch:tm>
1 f()        402ms  454ms      2.19     763MB     2.19    10    10      4.56s 
# … with 4 more variables: result <list>, memory <list>, time <list>, gc <list>
```

The key values to take from these are the `median` time and the memory allocation (`mem_alloc`).  The values of both metrics are 50% higher in R 3.6.3, consistent with allocating the memory three times rather than twice, and the difference in performance is more tangible the larger our vectors become.

## Summary

The changes to how memory allocations are tracked in R 4.0.0 are welcome, although whether they bring immediate widespread performance improvements is not clear.  The examples we've seen here are real, but are perhaps a little contrived and do not necessarily represent programming best practices.  Nonetheless there is potential they bring immediate benefits to users in some circumstances.


