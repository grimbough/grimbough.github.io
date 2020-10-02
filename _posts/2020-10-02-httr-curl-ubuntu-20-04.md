---
title: httr, cURL, and SSL problems on Ubuntu 20.04
tags:
    - R
    - httr
    - curl
    - ssl
header:
  teaser: /assets/images/curl-logo.png
excerpt: "A client side fix for SSL issues with httr and Ensembl"
---

# The problem

The introduction of an Ubuntu 20.04 based computer to the Bioconductor build system highlighted an incompatibility between that distribtion and R code trying to access resources hosted by [Ensembl](https://www.ensembl.org) e.g. the Ensembl REST API, BioMart, or RFAM.

Code example in these packages ran fine on the other test machines, but were failing to build on Ubuntu 20.04 with the following error:

> curl::curl_fetch_memory(url, handle = handle): error:14094410:SSL routines:ssl3_read_bytes:sslv3

Here's a code example:

```r
library(httr)
url <- "https://rest.ensembl.org/"

## This fails
res <- GET(url)
#> Error in curl::curl_fetch_memory(url, handle = handle): error:14094410:SSL routines:ssl3_read_bytes:sslv3 alert handshake failure
```

There's a really great [Github issue](https://github.com/Ensembl/ensembl-rest/issues/427#issue-614497457) by [Kiril Tsukanov](https://github.com/tskir) that digs into the reasons behind this this error, which boils down to an unfortunate combination of:

- The certificates used by the Ensembl webserver
- An increased default TLS security level in Ubuntu 20.04 
- A bug in OpenSSL 1.1.1

# A solution

Since we can't change the configuration of the webserver, and it's unlikely we can choose an alternative version of OpenSSL, the remaining option is to try and modifiy the TLS security level.  There are solutions to doing this at the system level on [Ask Ubuntu](https://askubuntu.com/questions/1233186/ubuntu-20-04-how-to-set-lower-ssl-security-level).  However, it's also possible to apply temporary configuration changes using functionallity within **httr**.  This is particularly useful if you're writing code to be run on someone else's machine, where you can't make system configuration changes.

The function we need is `config()` and we're looking to alter the value of the `ssl_cipher_list` property.  

```r
httr_config <- config(ssl_cipher_list = "DEFAULT@SECLEVEL=1")
```

We can then use this new configuration with our call to `httr::GET()`, and this time we get a valid response from the server

```r
res <- with_config(config = httr_config, GET(url))
res
#> Response [https://rest.ensembl.org/]
#>   Date: 2020-10-01 10:32
#>   Status: 200
#>   Content-Type: text/html; charset=utf-8
#>   Size: 31.5 kB
#> 
#> 
#> <!DOCTYPE html>
#> 
#> 
#> 
#> <html lang="en">
#> <head>
#>         <script src="/static/js/20-prettify.js"></script>
#>         <script src="/static/js/30-jquery-1.11.1.min.js"></script>
#> ...
```

In this example we used `with_config()`, which applies the given configuration to this specific call to `GET()`, but doesn't set anything system wide.  You could also use `set_config()` to apply this change as a global default for the duration of your R session.

## System compatibility

One thing to note is that these setting may not be appropriate on all operating systems, so you can't just set it in universally in a package you want to share.  For example, here's what happens if you run the above code on MacOSX.

```r
Sys.info()['sysname']
# sysname
# "Darwin"
with_config(config = httr_config, GET(url))
# Error in curl::curl_fetch_memory(url, handle = handle) :
#  failed setting cipher list: DEFAULT@SECLEVEL=1
```

One option is to only set this on Linux systems using something like this:

```r
httr_config <- switch(Sys.info()["sysname"],
                      "Linux" = config(ssl_cipher_list = "DEFAULT@SECLEVEL=1"),
                      config())
```

It's not clear whether this will be appropriate across all distributions, but it seems to have allowed Ubuntu 20.04 to access the Ensembl website and shown no ill effects on Ubuntu 16.04 and 18.04.

