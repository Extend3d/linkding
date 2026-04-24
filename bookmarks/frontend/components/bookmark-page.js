import { HeadlessElement } from "../utils/element.js";

class BookmarkPage extends HeadlessElement {
  init() {
    this.update = this.update.bind(this);
    this.onToggleNotes = this.onToggleNotes.bind(this);
    this.onToggleBulkEdit = this.onToggleBulkEdit.bind(this);
    this.onBulkActionChange = this.onBulkActionChange.bind(this);
    this.onToggleAll = this.onToggleAll.bind(this);
    this.onToggleBookmark = this.onToggleBookmark.bind(this);
    this.onCarouselWheel = this.onCarouselWheel.bind(this);
    this.onCarouselOverscrollEnd = this.onCarouselOverscrollEnd.bind(this);

    this.oldItems = [];
    this.boundCarousels = [];
    this.update();
    document.addEventListener("bookmark-list-updated", this.update);
  }

  disconnectedCallback() {
    document.removeEventListener("bookmark-list-updated", this.update);
  }

  pruneInactiveLayout() {
    // The page renders both the mobile (flat list) and desktop (carousels)
    // layouts so Turbo can swap either fragment in. Remove the inactive one
    // entirely so its <li>s and form inputs aren't visible to bulk-edit /
    // shortcut selectors and aren't submitted with the form.
    const isDesktop = window.matchMedia("(min-width: 841px)").matches;
    const inactiveSelector = isDesktop ? ".layout-mobile" : ".layout-desktop";
    this.querySelectorAll(inactiveSelector).forEach((node) => node.remove());
  }

  update() {
    this.pruneInactiveLayout();
    const items = this.querySelectorAll("ul.bookmark-list > li");
    this.updateTooltips(items);
    this.updateNotesToggles(items, this.oldItems);
    this.updateBulkEdit(items, this.oldItems);
    this.updateCarouselWheelScroll();
    this.oldItems = items;
  }

  updateCarouselWheelScroll() {
    // Translate vertical mouse-wheel input into horizontal scroll on each
    // carousel <ul>, so users with a traditional scroll wheel can traverse
    // tag rows without having to shift+wheel or click the scrollbar.
    this.boundCarousels.forEach((el) => {
      el.removeEventListener("wheel", this.onCarouselWheel);
      this.resetCarouselOverscroll(el);
    });

    const carousels = Array.from(
      this.querySelectorAll("ul.bookmark-list.carousel"),
    );
    carousels.forEach((el) => {
      el.addEventListener("wheel", this.onCarouselWheel, { passive: false });
    });
    this.boundCarousels = carousels;
  }

  onCarouselWheel(event) {
    const el = event.currentTarget;
    // Trackpads commonly emit a non-zero deltaX for diagonal/horizontal
    // gestures; don't interfere with those, the native behaviour is correct.
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      return;
    }
    if (event.deltaY === 0) {
      return;
    }
    // If the carousel content fits entirely, don't hijack the wheel - let the
    // page scroll vertically as usual.
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 1) {
      return;
    }

    // Some browsers report deltaY in "lines" (mode 1) or "pages" (mode 2);
    // translate to pixels so the scroll distance feels consistent.
    const multiplier =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientWidth : 1;
    const delta = event.deltaY * multiplier;

    const atStart = el.scrollLeft <= 0;
    const atEnd = el.scrollLeft >= maxScroll - 1;
    const pastEnd = delta > 0 && atEnd;
    const pastStart = delta < 0 && atStart;

    // Always capture the wheel on a scrollable carousel, even at the ends.
    // The alternative (letting the page scroll vertically when the user hits
    // an edge) makes it hard to "just scroll a carousel" without the page
    // jumping once the end is reached.
    event.preventDefault();

    if (pastEnd || pastStart) {
      this.applyCarouselOverscroll(el, delta);
    } else {
      this.resetCarouselOverscroll(el);
      el.scrollBy({ left: delta, behavior: "auto" });
    }
  }

  applyCarouselOverscroll(el, delta) {
    // Subtle rubber-band: accumulate a heavily-damped displacement, clamp it
    // to a small cap so the carousel can't be pulled too far, and schedule a
    // snap-back to 0 via CSS transition after a brief idle window.
    const MAX = 48;
    const DAMPING = 0.2;
    const current = el._overscrollX || 0;
    let next = current + delta * DAMPING;
    if (next > MAX) next = MAX;
    if (next < -MAX) next = -MAX;
    el._overscrollX = next;

    // Suppress the transition while we're tracking the wheel so the transform
    // follows input 1:1; the class is removed during snap-back so the CSS
    // transition takes over.
    el.classList.add("overscrolling");
    el.style.transform = `translateX(${-next}px)`;

    clearTimeout(el._overscrollTimer);
    el._overscrollTimer = setTimeout(() => {
      el.classList.remove("overscrolling");
      el.style.transform = "";
      el._overscrollX = 0;
      // Belt-and-braces cleanup in case transitionend doesn't fire (e.g. the
      // element was invisible).
      el.addEventListener("transitionend", this.onCarouselOverscrollEnd, {
        once: true,
      });
    }, 120);
  }

  resetCarouselOverscroll(el) {
    if (!el._overscrollX && !el._overscrollTimer) {
      return;
    }
    clearTimeout(el._overscrollTimer);
    el._overscrollTimer = null;
    el._overscrollX = 0;
    el.classList.remove("overscrolling");
    el.style.transform = "";
  }

  onCarouselOverscrollEnd(event) {
    const el = event.currentTarget;
    el._overscrollTimer = null;
  }

  updateTooltips(items) {
    // Add tooltip to title if it is truncated
    items.forEach((item) => {
      const titleAnchor = item.querySelector(".title > a");
      const titleSpan = titleAnchor.querySelector("span");
      if (titleSpan.offsetWidth > titleAnchor.offsetWidth) {
        titleAnchor.dataset.tooltip = titleSpan.textContent;
      } else {
        delete titleAnchor.dataset.tooltip;
      }
    });
  }

  updateNotesToggles(items, oldItems) {
    oldItems.forEach((oldItem) => {
      const oldToggle = oldItem.querySelector(".toggle-notes");
      if (oldToggle) {
        oldToggle.removeEventListener("click", this.onToggleNotes);
      }
    });

    items.forEach((item) => {
      const notesToggle = item.querySelector(".toggle-notes");
      if (notesToggle) {
        notesToggle.addEventListener("click", this.onToggleNotes);
      }
    });
  }

  onToggleNotes(event) {
    event.preventDefault();
    event.stopPropagation();
    event.target.closest("li").classList.toggle("show-notes");
  }

  updateBulkEdit() {
    if (this.hasAttribute("no-bulk-edit")) {
      return;
    }

    // Remove existing listeners
    this.activeToggle?.removeEventListener("click", this.onToggleBulkEdit);
    this.actionSelect?.removeEventListener("change", this.onBulkActionChange);
    this.allCheckbox?.removeEventListener("change", this.onToggleAll);
    this.bookmarkCheckboxes?.forEach((checkbox) => {
      checkbox.removeEventListener("change", this.onToggleBookmark);
    });

    // Re-query elements
    this.activeToggle = this.querySelector(".bulk-edit-active-toggle");
    this.actionSelect = this.querySelector("select[name='bulk_action']");
    this.allCheckbox = this.querySelector(".bulk-edit-checkbox.all input");
    this.bookmarkCheckboxes = Array.from(
      this.querySelectorAll(".bulk-edit-checkbox:not(.all) input"),
    );
    this.selectAcross = this.querySelector("label.select-across");
    this.executeButton = this.querySelector("button[name='bulk_execute']");

    // Add listeners
    this.activeToggle.addEventListener("click", this.onToggleBulkEdit);
    this.actionSelect.addEventListener("change", this.onBulkActionChange);
    this.allCheckbox.addEventListener("change", this.onToggleAll);
    this.bookmarkCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", this.onToggleBookmark);
    });

    // Reset checkbox states
    this.allCheckbox.checked = false;
    this.bookmarkCheckboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    this.updateSelectAcross(false);
    this.updateExecuteButton();

    // Update total number of bookmarks
    const totalHolder = this.querySelector("[data-bookmarks-total]");
    const total = totalHolder?.dataset.bookmarksTotal || 0;
    const totalSpan = this.selectAcross.querySelector("span.total");
    totalSpan.textContent = total;
  }

  onToggleBulkEdit() {
    this.classList.toggle("active");
  }

  onBulkActionChange() {
    this.dataset.bulkAction = this.actionSelect.value;
  }

  onToggleAll() {
    const allChecked = this.allCheckbox.checked;
    this.bookmarkCheckboxes.forEach((checkbox) => {
      checkbox.checked = allChecked;
    });
    this.updateSelectAcross(allChecked);
    this.updateExecuteButton();
  }

  onToggleBookmark(event) {
    // The carousel layout can render the same bookmark in multiple tag
    // carousels; keep all checkboxes for a given bookmark id in sync so the
    // user-visible selection matches what gets POSTed (which is also deduped
    // server-side as a safety net).
    const changed = event?.target;
    if (changed && changed.value) {
      this.bookmarkCheckboxes.forEach((checkbox) => {
        if (checkbox !== changed && checkbox.value === changed.value) {
          checkbox.checked = changed.checked;
        }
      });
    }

    const allChecked = this.bookmarkCheckboxes.every((checkbox) => {
      return checkbox.checked;
    });
    this.allCheckbox.checked = allChecked;
    this.updateSelectAcross(allChecked);
    this.updateExecuteButton();
  }

  updateSelectAcross(allChecked) {
    if (allChecked) {
      this.selectAcross.classList.remove("d-none");
    } else {
      this.selectAcross.classList.add("d-none");
      this.selectAcross.querySelector("input").checked = false;
    }
  }

  updateExecuteButton() {
    const anyChecked = this.bookmarkCheckboxes.some((checkbox) => {
      return checkbox.checked;
    });
    this.executeButton.disabled = !anyChecked;
  }
}

customElements.define("ld-bookmark-page", BookmarkPage);
