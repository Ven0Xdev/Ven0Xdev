/*
 * modal.js — רכיב Modal נגיש + Toast Notifications
 */
(function (FD) {
  "use strict";

  var Utils = FD.Utils, Icons = FD.Icons;
  var lastFocused = null;

  var Modal = {
    root: null,

    ensure: function () {
      if (this.root) return this.root;
      var overlay = Utils.el("div", { class: "fd-modal-overlay", id: "fd-modal", role: "dialog", "aria-modal": "true", hidden: true });
      var box = Utils.el("div", { class: "fd-modal", role: "document" });
      overlay.appendChild(box);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) Modal.close(); });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !overlay.hidden) Modal.close();
        if (e.key === "Tab" && !overlay.hidden) Modal.trapFocus(e, box);
      });
      document.body.appendChild(overlay);
      this.root = overlay;
      this.box = box;
      return overlay;
    },

    trapFocus: function (e, box) {
      var focusable = Utils.qsa('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', box);
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    },

    // open(title, contentNode, {labelledbyId})
    open: function (title, contentNode) {
      this.ensure();
      lastFocused = document.activeElement;
      Utils.clear(this.box);

      var header = Utils.el("div", { class: "fd-modal-head" }, [
        Utils.el("h2", { class: "fd-modal-title", id: "fd-modal-title" }, title),
        Utils.el("button", {
          class: "fd-icon-btn", "aria-label": "סגירת חלון", html: Icons.svg("close", 22),
          on: { click: function () { Modal.close(); } }
        })
      ]);
      this.root.setAttribute("aria-labelledby", "fd-modal-title");

      var body = Utils.el("div", { class: "fd-modal-body" }, [contentNode]);
      this.box.appendChild(header);
      this.box.appendChild(body);

      this.root.hidden = false;
      document.body.classList.add("fd-no-scroll");
      // מיקוד ראשוני
      var closeBtn = this.box.querySelector(".fd-icon-btn");
      if (closeBtn) closeBtn.focus();
    },

    close: function () {
      if (!this.root) return;
      this.root.hidden = true;
      document.body.classList.remove("fd-no-scroll");
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }
  };

  /* ---------- Toast ---------- */
  var Toast = {
    container: null,
    ensure: function () {
      if (this.container) return this.container;
      this.container = Utils.el("div", { class: "fd-toast-wrap", "aria-live": "polite", "aria-atomic": "true" });
      document.body.appendChild(this.container);
      return this.container;
    },
    show: function (message, type) {
      this.ensure();
      type = type || "info";
      var iconName = type === "success" ? "check" : type === "error" ? "info" : "info";
      var toast = Utils.el("div", { class: "fd-toast fd-toast--" + type, role: "status" }, [
        Icons.node(iconName, 18),
        Utils.el("span", null, message)
      ]);
      this.container.appendChild(toast);
      // אנימציית כניסה
      requestAnimationFrame(function () { toast.classList.add("is-in"); });
      setTimeout(function () {
        toast.classList.remove("is-in");
        setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
      }, 3200);
    }
  };

  FD.Modal = Modal;
  FD.Toast = Toast;
})(window.FD = window.FD || {});
