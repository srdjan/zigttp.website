// Landing page menu toggle
const zMenuButton = document.querySelector(".z-menu-button");
const zNavLinks = document.querySelector(".z-nav-links");
if (zMenuButton && zNavLinks) {
  const setMenuState = (open) => {
    zMenuButton.setAttribute("aria-expanded", String(open));
    zNavLinks.classList.toggle("open", open);
  };

  zMenuButton.addEventListener("click", () => {
    setMenuState(!zNavLinks.classList.contains("open"));
  });

  zNavLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenuState(false));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && zNavLinks.classList.contains("open")) {
      setMenuState(false);
    }
  });

  document.addEventListener("click", (e) => {
    if (zNavLinks.classList.contains("open") && !e.target.closest(".z-nav")) {
      setMenuState(false);
    }
  });
}

// Install command copy affordance.
const copyInstall = document.getElementById("copy-install");
const installCmd = document.getElementById("install-cmd");
if (copyInstall && installCmd) {
  const originalText = copyInstall.textContent;

  copyInstall.addEventListener("click", async () => {
    const command = (installCmd.dataset.command || installCmd.textContent)
      .replace(/\s+/g, " ")
      .trim();
    try {
      await navigator.clipboard.writeText(command);
      copyInstall.textContent = "Copied";
    } catch {
      globalThis.prompt("Copy install command", command);
      copyInstall.textContent = "Copy";
    }

    setTimeout(() => {
      copyInstall.textContent = originalText;
    }, 1500);
  });
}

// Burger menu toggle
const burger = document.querySelector(".nav-burger");
const navLinks = document.querySelector(".nav-links");
if (burger && navLinks) {
  const setMenuState = (open) => {
    burger.classList.toggle("active", open);
    navLinks.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", String(open));
  };

  burger.addEventListener("click", () => {
    setMenuState(!navLinks.classList.contains("open"));
  });
  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      setMenuState(false);
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && navLinks.classList.contains("open")) {
      setMenuState(false);
    }
  });
  document.addEventListener("click", (e) => {
    if (
      navLinks.classList.contains("open") && !e.target.closest(".nav-inner")
    ) {
      setMenuState(false);
    }
  });
}

// Tab switching with keyboard navigation.
// anime-scenes.js handles the visual cross-fade; this owns activation
// state, focus, and a11y attributes.
document.querySelectorAll('[role="tablist"]').forEach((tablist) => {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const container = tablist.closest(".code-tabs");
  // Only own .code-tabs tablists. Others (e.g. the playground seed tabs and
  // proof-lens bar) drive their own activation in playground.js.
  if (!container) return;

  function activateTab(tab) {
    const target = tab.dataset.tab;
    tabs.forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
      t.setAttribute("tabindex", "-1");
    });
    container
      .querySelectorAll(".tab-panel")
      .forEach((p) => {
        p.classList.remove("active");
        p.hidden = true;
      });

    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    tab.setAttribute("tabindex", "0");
    tab.focus();
    const panel = container.querySelector(`#tab-${target}`);
    panel.classList.add("active");
    panel.hidden = false;
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => activateTab(tab)));

  tablist.addEventListener("keydown", (e) => {
    const idx = tabs.indexOf(document.activeElement);
    if (idx < 0) return;
    let next;
    if (e.key === "ArrowRight") next = tabs[(idx + 1) % tabs.length];
    else if (e.key === "ArrowLeft") {
      next = tabs[(idx - 1 + tabs.length) % tabs.length];
    } else if (e.key === "Home") next = tabs[0];
    else if (e.key === "End") next = tabs[tabs.length - 1];
    if (next) {
      e.preventDefault();
      activateTab(next);
    }
  });
});

// Scroll spy for active nav indicator
const spyLinks = document.querySelectorAll(
  '.nav-links a[href^="#"], .z-nav-links a[href^="#"]',
);
const spySections = [...spyLinks].map((link) =>
  document.querySelector(link.getAttribute("href"))
).filter(Boolean);

if (spySections.length) {
  const scrollSpy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          spyLinks.forEach((link) => link.classList.remove("active"));
          const active = document.querySelector(
            `.nav-links a[href="#${entry.target.id}"], ` +
              `.z-nav-links a[href="#${entry.target.id}"]`,
          );
          if (active) active.classList.add("active");
        }
      });
    },
    {
      threshold: 0.3,
      rootMargin: `${-parseInt(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--nav-height",
        ),
      )}px 0px -60% 0px`,
    },
  );
  spySections.forEach((section) => scrollSpy.observe(section));
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (e) => {
    const target = document.querySelector(link.getAttribute("href"));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

// Safety net: if anime-scenes.js fails to load (CDN blocked, JS error,
// no ESM support), reveal every .pre-anim element after 3 seconds so
// content is never permanently hidden.
setTimeout(() => {
  document.documentElement.classList.add("anim-ready");
}, 3000);

// Slide deck navigation
const deck = document.getElementById("deck");
if (deck) {
  const viewport = deck.querySelector(".deck-viewport");
  const slides = deck.querySelectorAll(".deck-slide");
  const dots = deck.querySelectorAll(".deck-dot");
  const counter = deck.querySelector(".deck-counter");
  const prevBtn = deck.querySelector(".deck-prev");
  const nextBtn = deck.querySelector(".deck-next");
  const total = slides.length;
  let currentSlide = 0;
  let animating = false;

  const updateButtons = () => {
    prevBtn.disabled = currentSlide === 0;
    nextBtn.disabled = currentSlide === total - 1;
  };

  const go = (next) => {
    if (next < 0 || next >= total || next === currentSlide || animating) return;
    viewport.style.setProperty("--slide-dir", next > currentSlide ? 1 : -1);

    slides[currentSlide].classList.remove("active");
    dots[currentSlide].classList.remove("active");

    currentSlide = next;
    const slide = slides[currentSlide];
    slide.classList.add("active");
    dots[currentSlide].classList.add("active");
    counter.textContent = (currentSlide + 1) + " / " + total;
    updateButtons();

    animating = true;
    slide.addEventListener("animationend", () => {
      animating = false;
    }, { once: true });
  };

  dots.forEach((dot, i) => {
    dot.addEventListener("click", () => go(i));
  });

  prevBtn.addEventListener("click", () => go(currentSlide - 1));
  nextBtn.addEventListener("click", () => go(currentSlide + 1));

  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (
      e.key === " " &&
      (tag === "BUTTON" || tag === "INPUT" || tag === "TEXTAREA")
    ) return;
    if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      go(currentSlide + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(currentSlide - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(total - 1);
    }
  });
}
