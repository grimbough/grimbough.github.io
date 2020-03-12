---
title: 
tags:
    - R
    - github
---

# Github Actions and R Package Development

Workflows executed via Github Actions are a great way to automate checking changes you make to an R package as you get access to all three major platforms (Windows, Mac OSX, Linux).

However, the run of `R CMD check` was consistently failing on Windows with the warning:

```
* checking line endings in shell scripts ... WARNING
Found the following shell script(s) with CR or CRLF line endings:
  configure.ac
Non-Windows OSes require LF line endings.
```

This was super annoying, as the error did not show up either during local testing, or on any of the Github workflows running on other operating systems.

The solution was to add

```
      - name: Configure git
        run: git config --global core.autocrlf false
```