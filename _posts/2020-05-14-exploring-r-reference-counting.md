---
title: Exploring R Reference Counting
tags:
    - R
---

One of the major changes in R 4.0.0 is the s

> Reference counting is now used instead of the NAMED mechanism for determining when objects can be safely mutated in base C code. This reduces the need for copying in some cases and should allow further optimizations in the future.

```r
set.seed(1)
a <- sample(1:10L, 5)
```

Now we use the `tracemem()` function to mark `a`.  The immediate result of this is the location of `a` in memory being printed to screen ("`0x563f34dcca88`" represents the location).  

```r
tracemem(a)
#> [1] "<0x563f34dcca88>"
```

Marking an obejct with `tracemem()` also has the consequence of that if the tagged object is copied or coerced to a different type a message will be printed to screen.  Let's test this by changing a the first element of `a` for a new integer:

```r
a[1] <- 2L
```

In this case nothing is printed to screen.  This is because R is able to operated 'in-place' swapping the value of the first element without needing to make a copy of the whole vector.  Now we'll try changing an element to a double instead:

```r
a[2] <- 5.5
#> tracemem[0x563f34dcca88 -> 0x563f33b63968]: 
```

This time we can see the `tracemem` message is triggered.  Mising integers and doubles in a single vectors is allowed by R, so by inserting a double into our existing integer vector all elements of `a` need to be coerced to doubles too.  This requires twice as much memory, and so `a` is copied to a new location and out message is printed.  Here `0x563f34dcca88 -> 0x563f33b63968` indicates the previous memory location and where is has moved to.

Now lets create a new variable, `b`, and assign it our existing `a` variable.  Note there's no message printed here, so `a` hasn't been touched.  We then use `tracemem()` on `b`, to begin tracking that too.  Note that the current location of `b` is `0xx563f33b63968`, which is the same as where `a` was moved to in the previous step.  This demonstrates how R can have multiple variable pointing to the same memory.

```r
b <- a
tracemem(b)
#> [1] "<0xx563f33b63968>"
```

As we just establish, curretly `a` and `b` are identical and actual reference exactly the same block of memory.  Let's now change an element of `a`. 

```r
a[3] <- 6.2
#> tracemem[0x563f33b63968 -> 0x563f33b63ab8]: 
```

This triggers another copying , as `a` and `b` are no longer identical and so can't utilise the same memory.  This leaves us in the situation where `a` and `b` are now distinct.

## R-3.6.3

```r
b[1] <- 17.0
#> tracemem[0x563f33b63968 -> 0x563f33b63d58]: 
```

## R-4.0.0

With R-4.0.0 the situation is different.  R is able to keep track of the number of references and is aware that now only `b` points to it's particular memory location.  If we modify a single element here, it's is able to do this in-place, just as if `b` was a freshly created variable that had never been related to `a`.

```r
b[1] <- 17.0
```
