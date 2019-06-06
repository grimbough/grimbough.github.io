---
title: Obtaining chromosome lengths in Bioconductor
tags:
    - bioconductor
header:
  og_image: /assets/images/bioc-question-1.png
---

The following question was asked in the Bioconductor [slack channel](https://community-bioc.slack.com/)

![](/assets/images/bioc-question-1.png "Is there any way to get the lengths of chromosomes given a genome name?")

Many different people suggested strategies, and it turns out there are quite a lot of ways to get this information.  Here's a quick summary broken down by whether you want to get the information from UCSC or Ensembl (chr1 vs 1) and by the principle package used.  Since the original question mentioned the 'mm9' assembly of the mouse genome that's what's used in the following examples, although the same strategies should work for many other organisms and assemblies.

## UCSC

First we'll start with methods for getting the chromosome lengths from UCSC.  

### **GenomicFeatures** ([Martin Morgan](https://community-bioc.slack.com/team/U37PBKU0K))

This relies on a working internet connection, but the download is tiny so it's super fast.  Returns a simple `data.frame` with chromosome names and lengths - pretty much the perfect answer to the question.

```r
library(GenomicFeatures)
getChromInfoFromUCSC("mm9") %>%
    head()
```

```
  chrom    length
1  chr1 197195432
2  chr2 181748087
3  chr3 159599783
4  chr4 155630120
5  chr5 152537259
6  chr6 149517037
```

### **rtracklayer** ([Malte Thodberg](https://community-bioc.slack.com/team/UCH2D62R4))

Also requires a working internet connection and returns a `Seqinfo` object.  If the aim is to use the chromosome lengths to build a `GRanges` object you can use similar function `GRangesForUCSCGenome("mm9")` to get straight there - a nice shortcut.

```r
library(rtracklayer)
SeqinfoForUCSCGenome("mm9")
```

```
Seqinfo object with 35 sequences from mm9 genome:
  seqnames     seqlengths isCircular genome
  chr1          197195432       <NA>    mm9
  chr2          181748087       <NA>    mm9
  chr3          159599783       <NA>    mm9
  chr4          155630120       <NA>    mm9
  chr5          152537259       <NA>    mm9
  ...                 ...        ...    ...
  chr16_random       3994       <NA>    mm9
  chr17_random     628739       <NA>    mm9
  chrX_random     1785075       <NA>    mm9
  chrY_random    58682461       <NA>    mm9
  chrUn_random    5900358       <NA>    mm9
```

### **GenomicInfoDb** ([Ludwig Geistlinger](https://community-bioc.slack.com/team/U5GEJCKJA))

We can use the **GenomicInfoDb** package in conjunction with the **TxDb** package for the genome in question.  As a general statement this will be a bigger download than any of the other solutions, although the package download only needs to happen once, and then this approach can be used offline.  To check if your assembly is avaiable, all **TxDb** packages can be listed with `BiocManager::available("^TxDb")`.  The return type is a named `vector` where the name of each entry corresponds to a chromosome name.

```r
library(GenomicInfoDb)
library(TxDb.Mmusculus.UCSC.mm9.knownGene)
seqlengths(TxDb.Mmusculus.UCSC.mm9.knownGene)
```

```
        chr1         chr2         chr3         chr4         chr5         chr6         chr7 
   197195432    181748087    159599783    155630120    152537259    149517037    152524553 
        chr8         chr9        chr10        chr11        chr12        chr13        chr14 
   131738871    124076172    129993255    121843856    121257530    120284312    125194864 
       chr15        chr16        chr17        chr18        chr19         chrX         chrY 
   103494974     98319150     95272651     90772031     61342430    166650296     15902555 
        chrM  chr1_random  chr3_random  chr4_random  chr5_random  chr7_random  chr8_random 
       16299      1231697        41899       160594       357350       362490       849593 
 chr9_random chr13_random chr16_random chr17_random  chrX_random  chrY_random chrUn_random 
      449403       400311         3994       628739      1785075     58682461      5900358 
```

## Ensembl

If you prefer to work with references from Ensembl, there are plenty of options there too, although note that you probably won't be able to use the 'mm9' nomenclature.  

### **GenomicFeatures**

Again we can use the **GenomicFeatures** package, but specifying that we want to get the data from Biomart.  For me is the slowest of the options listed and that time is required for each run, nothing is cached.  Note that we have to use the name of the dataset within Ensembl, rather than the genome ID or organism name.  Also, to return results from mm9 (NCBI m37) we have to use the archive of Ensembl 67, from May 2012.  Otherwise using the default parameters will return the most recent genome build. Again you get the simple two column `data.frame` result.

```r
library(GenomicFeatures)
getChromInfoFromBiomart(dataset = 'mmusculus_gene_ensembl',
                        host = "http://may2012.archive.ensembl.org") %>%
    dplyr::arrange(chrom) %>%
    head()
```

```r
  chrom    length
1     1 197195432
2    10 129993255
3    11 121843856
4    12 121257530
5    13 120284312
6    14 125194864
```

### Ensembl REST API

There's a bit more code here as it isn't wrapped inside a package (it's not really a Bioconductor solution, but I'm a fan of the Ensmbl API).  The results also comeback in an unexpected order and it's not super simple to sort as this is a character vector.  This may or may not matter depending upon the intended use.  This time we just use the English language name of the organism e.g. '*mouse*', but it will also work with '*mus_musculus*'.  Unfortunately this approach can not get us details for the mm9 genome build.  You can use the REST API to find the available assemblies, which at the time of writing is only GRCm38.p6.

```r
library(httr)
library(jsonlite)
library(xml2)
library(dplyr)

GET("https://rest.ensembl.org/info/assembly/mouse?", 
    content_type("application/json")) %>% 
    httr::content(type = "text/plain", encoding = "UTF-8") %>%
    fromJSON() %$%
    top_level_region %>%
    dplyr::filter(coord_system == "chromosome") %>%
    head()
```

```
  name coord_system    length
1    X   chromosome 171031299
2   18   chromosome  90702639
3    6   chromosome 149736546
4    7   chromosome 145441459
5    5   chromosome 151834684
6    1   chromosome 195471971
```

## Conclusion

I'm sure there must be many more approaches (this doesn't even touch on CRAN packages) and there isn't an obvious best choice, although `GenomicFeatures::getChromInfoFromUCSC()` seems both quick and simple.  Ultimately the decision comes down to many factors: which packages you're happy for your code to depend on; speed; reliance on an internet connection; convenience of the output format for your task; etc. On thing that is clear is that there's no need to reinvent the wheel for this particular task.