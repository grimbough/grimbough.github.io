window.cookieconsent.initialise({
  "palette": {
    "popup": {
      "background": "#252e39"
    },
    "button": {
      "background": "#14a7d0"
    }
  },
  "theme": "classic",
  "position": "bottom-left",
  "type": "opt-in",
  "content": {
    "message": "This website uses cookies to ensure you get the best experience here.",
    "href": "www.msmith.de/privacy"
  },
  onInitialise: function (status) {
    var type = this.options.type;
    var didConsent = this.hasConsented();
    if (type == 'opt-in' && didConsent) {
      // enable cookies
      loadGAonConsent();
    }
    if (type == 'opt-out' && !didConsent) {
      // disable cookies
    }
  },
  onStatusChange: function(status, chosenBefore) {
    var type = this.options.type;
    var didConsent = this.hasConsented();
    if (type == 'opt-in' && didConsent) {
      // enable cookies
      loadGAonConsent();
    }
    if (type == 'opt-out' && !didConsent) {
      // disable cookies
    }
  },
  onRevokeChoice: function() {
    var type = this.options.type;
    if (type == 'opt-in') {
      // disable cookies
    }
    if (type == 'opt-out') {
      // enable cookies
      loadGAonConsent();
    }
  }
});
