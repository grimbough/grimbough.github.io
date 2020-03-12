---
title: Github Workflows and Windows Line Endings
tags:
    - R
    - github
---

Workflows executed via Github Actions are a great way to automate checking changes you make to an R package as you get access to all three major platforms (Windows, Mac OSX, Linux).  I've been using them with the [**rhdf5filters**](https://github.com/grimbough/rhdf5filters) package, which isn't yet in Bioconductor and so doesn't get to benefit from the multi-platform checking provided there.

However, the run of `R CMD check` was consistently failing on Windows with the warning:

```
* checking line endings in shell scripts ... WARNING
Found the following shell script(s) with CR or CRLF line endings:
  configure.ac
Non-Windows OSes require LF line endings.
```

This was super annoying as the error did not show up either during local testing, nor on the Github workflows running on other operating systems.  I tried quite a number of strategies for trying to pin this behaviour down, including running `dos2unix`, changing execute permissions on the file, modifying the style of comments, and re-writing it using R, none of which made any difference.

With the help of [<svg class="svg-inline--fa fa-twitter-square fa-w-14 fa-fw" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="twitter-square" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" data-fa-i2svg=""><path fill="currentColor" d="M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48zm-48.9 158.8c.2 2.8.2 5.7.2 8.5 0 86.7-66 186.6-186.6 186.6-37.2 0-71.7-10.8-100.7-29.4 5.3.6 10.4.8 15.8.8 30.7 0 58.9-10.4 81.4-28-28.8-.6-53-19.5-61.3-45.5 10.1 1.5 19.2 1.5 29.6-1.2-30-6.1-52.5-32.5-52.5-64.4v-.8c8.7 4.9 18.9 7.9 29.6 8.3a65.447 65.447 0 0 1-29.2-54.6c0-12.2 3.2-23.4 8.9-33.1 32.3 39.8 80.8 65.8 135.2 68.6-9.3-44.5 24-80.6 64-80.6 18.9 0 35.9 7.9 47.9 20.7 14.8-2.8 29-8.3 41.6-15.8-4.9 15.2-15.2 28-28.8 36.1 13.2-1.4 26-5.1 37.8-10.2-8.9 13.1-20.1 24.7-32.9 34z"></path></svg>AlanBOCallaghan](https://www.twitter.com/AlanBOCallaghan) it turns out the default behaviour of git on Windows is to automatically change line endings to the Windows style `CRLF`.  The first step of my workflow was to clone the git repository, and hence, regardless of what had been committed, the line endings of `configure.ac` (and presumably all the other source files) really would be `CRLF`.

The solution was to add the following step as the first item in my workflow, before the git checkout (you can view the exact position [here](https://github.com/grimbough/rhdf5filters/blob/12908b0ed61f0c2e4146580cf18981e0ce6042a7/.github/workflows/main.yml#L30).  This setting turns off the conversion behaviour and will leave line endings as they are in the repository. 

```
      - name: Configure git
        run: git config --global core.autocrlf false
```

The workflow then completed [successfully](https://github.com/grimbough/rhdf5filters/actions/runs/54338931).
