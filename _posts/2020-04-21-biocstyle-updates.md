---
title: BiocStyle updates for mobile screens
tags:
    - R
    - Bioconductor
    - R Markdown
header:
  og_image: /assets/images/BiocStyle.png
---

Until recently **BiocStyle** didn't render particularly nicely on narrow screens e.g. if you're reading a vignette on a phone screen.  The left and right margins dominate and compress the main content to be almost unreadably narrow e.g.

<figure style="width: 60%" class="half">
    <img src="https://user-images.githubusercontent.com/971237/68586393-de4cf100-0484-11ea-81f0-39df6aa64b91.png">
    <img src="https://user-images.githubusercontent.com/971237/68586400-e016b480-0484-11ea-94cd-8c9e7ccfc83c.png">
</figure>

For the next Bioconductor release [@andrzejkoles](https://twitter.com/andrzejkoles) and I have added some additional CSS that comes into play when the screen width is less than 768 pixels.  The changes include:

- In-chapter navigation panel removed.
- Left indent for lists removed - now aligned with left margin.
- Right-hand margin removed.
- Margin notes now appear inline & are displayed/hidden by clicking on the relevant reference number in the text.
- All three figure sizes now fill the full width, but their aspect ratios are maintained.
- Tables and code blocks do not wrap, but scroll horizontally.

Examples of some of these can be seen below:

<figure style="width: 60%" class="half">
    <img src="https://user-images.githubusercontent.com/971237/68587121-94650a80-0486-11ea-8be7-62fd0494f291.png">
    <img src="https://user-images.githubusercontent.com/971237/68587127-97f89180-0486-11ea-91a0-afa02217084a.png">
    <img src="/assets/images/biocstyle_plots.png">
    <img src="/assets/images/biocstyle_footnotes.gif">
</figure>


For 'medium' sized screen (width between 768 and 992 pixels) like a tablet, it picks a hybrid of the existing and narrow styles, with the left-hand floating navigation retained, but most of the other changes still implemented e.g. 

<figure style="width: 75%" class="half">
    <img src="https://user-images.githubusercontent.com/971237/68588279-5c12fb80-0489-11ea-9222-e47b6f2d22c2.png">
</figure>    

We've tested this on a few different vignettes and browsers, but would welcome any feedback by opening an issue on [Github](https://github.com/Bioconductor/BiocStyle/issues)
