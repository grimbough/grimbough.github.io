---
#redirect_from: "/2017/06/23/download-file"
layout: single
title: Default behaviour of `download.file()` on Windows
---

I recently responded to this post on the Bioconductor forum regarding a problem with reading a HDF5 file using the rhdf5 package.  I was initially unable to reproduce the problem until I tried on Windows, then it failed immediately.  Here’s an examination of why.

Demonstrating the issue
First we’ll load the library and set the download URL

```r
library(rhdf5)
file_url <- "http://support.hdfgroup.org/ftp/HDF5/examples/files/exbyapi/h5ex_d_sofloat.h5"
```

Now we’ll download the file twice.  The first time treating it as a text file, the second as binary.  This is specified by the mode argument.

```r
h5_text_dl <- file.path(tempdir(), "h5.text.h5")
download.file(url = file_url,
              destfile = h5_text_dl, 
              mode = "w")

h5_binary_dl <- file.path(tempdir(), "h5.binary.h5")
download.file(url = file_url,
              destfile = h5_binary_dl, 
              mode = "wb")
```

The output that is printed to screen is identical, so I'll include it only once.  Note that the file is of length 8072 bytes. I’ve no idea what that content type represents, it’s simply listed as 'unknown' on other platforms.

```
trying URL 'http://support.hdfgroup.org/ftp/HDF5/examples/files/exbyapi/h5ex_d_sofloat.h5'
Content type ' â³7û ' length 8072 bytes
downloaded 8072 bytes
```

Now we’ll do two operations on the downloaded files; We’ll ask for the size of the file, and then we’ll try to list the contents.  First the ‘text’ version:

```r
> file.size(h5_text_dl)
[1] 8137
> h5ls(h5_text_dl)
 Error in H5Fopen(file, "H5F_ACC_RDONLY") : 
  HDF5. File accessability. Unable to open file.
```

```r
> file.size(h5_binary_dl)
[1] 8072
> h5ls(h5_binary_dl)
  group name       otype dclass     dim
0     /  DS1 H5I_DATASET  FLOAT 64 x 32
```

The text version is not the same size as the original download (Windows has done something!), and it is no longer a valid HDF5 file, hence the error message.  With the binary download the file stays intact and can be read.

# Why’s this happening?

When you select the mode = "wb" option, your file is downloaded and reproduced byte by byte on the local machine.  Assuming nothing really unexpected happens you will have an identical copy.  However, when you chose mode = "w" or (since this is the default) don’t specify anything to the mode argument, files can end up slightly modified.  Specifically, any line-feed characters (\n) will be translated into carriage-return line-feed (\r\n), as this is the default ‘end-of-line’ signal on Windows.  This explains why the final file is larger, since there are now some additional symbols in there.

HDF5 files don’t necessarily have many line-feed characters, but the initial 8-byte file signature that starts any HDF5 file contains both \r\n and \n, the latter of which gets converted, and the new file is no longer valid HDF5.  The format definition states:

> The CR-LF sequence catches bad file transfers that alter newline sequences. … … The final line feed checks for the inverse of the CR-LF translation problem.

Given this is an explicit design choice it would be nice if the library suggested that as a reason for the failure, rather than simply reporting it was unable to open the file, but you can’t have everything.

I can’t really see a good argument for why the default argument to download.file() is still the ‘text’ option, since all of R‘s file reading functions like read.table() are capable of handling text files with either type of line ending irrespective of the currently platform, but I wouldn’t expect it to change any time soon.
