// Menu toggle: the button opens/closes the menu; a link click, Escape, or a
// click outside `outsideSelector` closes it. Shared by the homepage nav and
// the deck burger, which differ only in selectors and whether the button
// carries an active class.
function initMenuToggle(button, links, outsideSelector, buttonActiveClass) {
  if (!button || !links) return;

  const setMenuState = (open) => {
    if (buttonActiveClass) button.classList.toggle(buttonActiveClass, open);
    links.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
  };

  button.addEventListener("click", () => {
    setMenuState(!links.classList.contains("open"));
  });
  links.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenuState(false));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && links.classList.contains("open")) {
      setMenuState(false);
    }
  });
  document.addEventListener("click", (e) => {
    if (
      links.classList.contains("open") && !e.target.closest(outsideSelector)
    ) {
      setMenuState(false);
    }
  });
}

// Landing page nav menu.
initMenuToggle(
  document.querySelector(".z-menu-button"),
  document.querySelector(".z-nav-links"),
  ".z-nav",
);

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

// Deck burger menu.
initMenuToggle(
  document.querySelector(".nav-burger"),
  document.querySelector(".nav-links"),
  ".nav-inner",
  "active",
);

// Scroll spy for active nav indicator
const spyLinks = document.querySelectorAll(
  '.nav-links a[href^="#"], .z-nav-links a[href^="#"]',
);
const spySections = [...spyLinks].map((link) =>
  document.querySelector(link.getAttribute("href"))
).filter(Boolean);

if (spySections.length) {
  const linkForId = new Map();
  spyLinks.forEach((link) => {
    const id = link.getAttribute("href").slice(1);
    if (!linkForId.has(id)) linkForId.set(id, link);
  });
  const scrollSpy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          spyLinks.forEach((link) => link.classList.remove("active"));
          const active = linkForId.get(entry.target.id);
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
