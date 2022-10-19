---
title: Adding anchor links to equations in Quarto
tags:
    - R
    - quarto
header:
  teaser: /assets/images/quarto-links-teaser.png
  og_image: /assets/images/quarto-links-twitter.png
excerpt: "Quarto doesn't add anchor links to equations by default, but you can add them yourself"
---

Quarto will add anchor links to document sections, allowing you to more easily bookmark or link to a specific part of a larger body of text.  If you enable this feature then, to quote the [Quarto documentation](https://quarto.org/docs/output-formats/html-basics.html):

> Anchor links are also automatically added to figures and tables that have a cross reference defined.

This is also really handy, but unfortunately anchors aren't added to equations even though they can also be cross-referenced in the text.  However all is not lost! We can use the features Quarto to add them ourselves.

# A solution

In order to do this, we can make use of the post-render functionality of Quarto to add the required elements to the created HTML output using an R script. A complete `post_add_equation_links.R` script can be found in this [Gist](https://gist.github.com/grimbough/6014ec0a5aeeac49487536db68074dfb) and I'll describe the contents here.

## Adding AnchorJS 

Quarto uses the [AnchorJS](https://www.bryanbraun.com/anchorjs) JavaScript library to add its anchor links to HTML pages. It does this by adding `anchored` to the HTML class attribute for sections, tables, figures etc and then AnchorJS adds the actual icons when the page is rendered by the browser.  A first approach might be to simply add the `anchored` class to equations as well.  However adding this class to equations results in some pretty horrible formatting as the right floating anchor doesn't interact well with the equation layout and ends up below:

![](/assets/images/equation_link_screenshot_bad.png "This link is in the wrong place")

We could perhaps play with the styling and placement of equations, but to me a better strategy is to use a second set of anchors that are styled differently.  We use the following R function to insert the declaration of a second set of anchors on the page, which will have a different theme from the existing anchors.  Primarily this is `placement: 'left'` so as to avoid the equation, and an additional class `'eq-link'` to help us style with CSS.

```r
## expects to be passed HTML that has already been read with readLines()
insert_anchor_JS <- function(lines) {
  
  ## we'll look for this JavaScript entry in the html
  pattern <- "const anchorJS = new window.AnchorJS();"

  ## this is the new JavaScript to insert
  insert <- "  const anchorJS_eq = new window.AnchorJS();
  anchorJS_eq.options = {
    placement: 'left',
    class: 'eq-link',
    icon: icon
  };
  anchorJS_eq.add('.anchored-eq');"
  
  ## Look for the existing JS line, and if we find it
  ## insert the new JS before the original declaration
  line <- grep(pattern = pattern, x = lines, fixed = TRUE)
  if(length(line) == 1) {
    lines[line] <- paste(insert, lines[line], sep = "\n")
  }
  
  return(lines)
}
```

## Adding a new HTML class to equations

The code above won't do anything on its own.  The `anchorJS_eq.add('.anchored-eq');` command will add the anchors to any element with class `anchored-eq`.  However by default there shouldn't be any elements with that class.  We need to modify the equations in our HTML files to add this class.  The function below does this by identifying HTML elements with the pattern `<span id="eq-`, which should be sufficient to find any numbered equations in our document.  It then adds the `class="anchored-eq"` to each identified `<span>` and updates the original HTML file.

```r
## input is the path to an HTML file
add_equation_links <- function(input) {
  
  ## read HTML file and add the second AnchorJS declaration
  lines <- readLines(input, warn = FALSE) |>
    insert_anchor_JS()
  
  ## find all spans that have an equation identifier
  equation_lines <- grep(x = lines, "span.*eq-")
  
  ## iterate over equation lines and add the new class
  for(j in seq_along(equation_lines)) {
    
    ## extract only the equation id from the line
    equation_id <- sub(lines[equation_lines[j]], 
                       pattern = ".*(eq-[[:alnum:]]*).*", 
                       replacement = "\\1")
    
    ## create a new span with additional class and data-anchor-id attributes
    new_line <- sub(x = lines[equation_lines[j]], 
                    pattern = "span", 
                    replacement = sprintf('span class="anchored-eq" data-anchor-id="%s"', equation_id))
    
    ## replace the old equation line 
    lines[equation_lines[j]] <- new_line
  }

  ## overwrite the input HTML file
  writeLines(text = lines, con = input)
}
```

## Calling the functions

To bring these steps together we put them in a single script. We then use the environment variable `QUARTO_PROJECT_OUTPUT_DIR` to identify where the output HTML files are during the Quarto build, and finally apply the function to each file. 

```
html_files <- list.files(path = Sys.getenv("QUARTO_PROJECT_OUTPUT_DIR"), 
                         pattern = ".html",
                         full.names = TRUE)

invisible(lapply(html_files, FUN = add_equation_links))
```

A copy of the complete `post_add_equation_links.R` script can be found in this [Gist](https://gist.github.com/grimbough/6014ec0a5aeeac49487536db68074dfb).

## Telling Quarto to use it

We then need to add the script to the post-render step in our `_quarto.yml` file:

```yaml
project:
  post-render:
    - post_add_equation_links.R
```

## Styling with CSS

We told AnchorJS to add the class `eq-link` to our new anchors.  We can then use this to style them differently from existing anchors if we we want.  For example, I wanted to get rid of the default negative left margin, and also set the z-buffer to ensure that the anchor appears on top of the MathJax equation e.g.

```css
.eq-link {
  z-index: 1;
  margin-left: 0 !important;
}
```

You can of course apply whatever styling you like, and the [AnchorJS site](https://www.bryanbraun.com/anchorjs/#examples) has some great examples.

## The final result

![](/assets/images/equation_link_screenshot.png "This equation has an anchor link floating to the left")

We use this extensively in the Quarto version of [Modern Statistics for Modern Biology](https://www.huber.embl.de/msmb-quarto).

