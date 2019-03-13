---
#redirect_from: "/2017/06/23/download-file"
layout: single
title: Using your own version of `libxml2` in R
---


My previous post <a href="http://www.msmith.de/2017/03/03/30/">here</a> discussed how to build recent versions of R on an old machine that has outdated system libraries.  Similarly, sometimes you can get the core parts of R work, but one of the packages you&#8217;re trying to use fails to work as you&#8217;d expect.  Once such example was posted on the Bioconductor support forum <a href="https://support.bioconductor.org/p/93152/">here</a>, where the XML package seems to install just fine but the parseURI() function doesn&#8217;t work.

```r
library(XML)
XML::parseURI("")</textarea></div>
```

```
>  Error in XML::parseURI("") : cannot parse URI
```

It turns out the root cause of this is the system version of libxml2 is extremely old. So we’re going to download, compile and then get R to use a more up-to-date version.

## libxml2 installation

In the same style as with building R, I use a folder called src to hold the downloaded library, and plan to install it in a folder called usr. Both of these are located in my home directory. Below are the steps I used to build my own version of libxml2. Lines 1-4 download and extract the source files. Line 5 configures the compilation; we use the --prefix argument to tell it we’re want the final installation to be put in that location. I also choose to remove support for python here, it was leading to errors trying to write to locations I didn’t have permissions for, and since I didn’t need python support this seemed OK to me. The final line executes the compilation and then copies the results into the appropriate locations.

```sh
cd $HOME/src
wget http://xmlsoft.org/sources/libxml2-2.9.4.tar.gz
tar xzf libxml2-2.9.4.tar.gz
cd $HOME/src/libxml2-2.9.4
./configure --prefix=$HOME/usr --without-python
make &amp;&amp; make install
```

We then need to reinstall the library in R and then test the previously broken function.

```r
&gt; install.packages('XML')
&gt; XML::parseURI("")
$scheme
[1] ""

$authority
[1] ""

$server
[1] ""

$user
[1] ""

$path
[1] ""

$query
[1] ""

$fragment
[1] ""

$port
[1] NA

attr(,"class")
[1] "URI"
```


## What if things still aren&#8217;t working?

If you&#8217;re still getting the error, you can check exactly which copy of the xml library you&#8217;re linking against using the following code.

```r
library(XML)
path <- unclass(getLoadedDLLs()
[["XML"]])$path
system2("ldd", args=path)
```

```
linux-vdso.so.1 =>  (0x00007fffb9dfd000)
libxml2.so.2 => /home/mike/usr/lib/libxml2.so.2 (0x00002b823be13000)
libz.so.1 => /home/mike/usr/lib/libz.so.1 (0x00002b823c161000)
libm.so.6 => /lib64/libm.so.6 (0x00002b823c38c000)
libdl.so.2 => /lib64/libdl.so.2 (0x00002b823c60f000)
libc.so.6 => /lib64/libc.so.6 (0x00002b823c814000)
/lib64/ld-linux-x86-64.so.2 (0x0000003246c00000)
```

You can see in line 2 of the output above I’m using the version in my home directory. If this entry is something like `/usr/lib/libxml2.so.2` you’re still using the system library and you might want to look at the suggestions below.

There are a few places problems could arise if you’ve skipped some steps, particularly if you didn’t install R in the same way I did previously. For example there’s the entries in my $PATH environment variable, which are shown below:

`/home/mike/usr/bin:/usr/kerberos/bin:/usr/local/bin:/usr/bin:/bin:/usr/X11R6/bin`

You can see this includes `/home/mike/usr/bin`. When libxml2 was installed, it placed a script called xml2-config in this folder. This script is then run when you install the XML R package, and helps with the setup. If you haven’t added the equivalent of `/home/mike/usr/bin` to your path one of two things will happen. Either:

- xml2-config won’t be found and the package installation will fail, or
- An older version somewhere else on the system will be found, the installation will proceed, but you’ll still encounter the original error.

There are few things you can do to get around this. The simplest is to add the appropriate location to your `$PATH` as I’ve done. Alternatively, you can manually supply the location of xml2-config during package installation like so:

```r
install.packages("XML", 
        configure.args='--with-xml-config="$HOME/usr/bin/xml2-config"')
```

### Acknowledgements

Thanks to Bioconductor user JunLVI for asking this question and experimenting with various suggestions, and Martin Morgan for demonstrating a number of strategies for debugging this.
