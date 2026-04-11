// Burger menu toggle
const burger = document.querySelector(".nav-burger");
const navLinks = document.querySelector(".nav-links");
if (burger && navLinks) {
  burger.addEventListener("click", () => {
    burger.classList.toggle("active");
    navLinks.classList.toggle("open");
  });
  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      burger.classList.remove("active");
      navLinks.classList.remove("open");
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && navLinks.classList.contains("open")) {
      burger.classList.remove("active");
      navLinks.classList.remove("open");
    }
  });
  document.addEventListener("click", (e) => {
    if (navLinks.classList.contains("open") && !e.target.closest(".nav-inner")) {
      burger.classList.remove("active");
      navLinks.classList.remove("open");
    }
  });
}

// Tab switching with keyboard navigation
document.querySelectorAll('[role="tablist"]').forEach((tablist) => {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const container = tablist.closest(".code-tabs");

  function activateTab(tab) {
    const target = tab.dataset.tab;
    tabs.forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
      t.setAttribute("tabindex", "-1");
    });
    container
      .querySelectorAll(".tab-panel")
      .forEach((p) => p.classList.remove("active"));

    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    tab.setAttribute("tabindex", "0");
    tab.focus();
    container.querySelector(`#tab-${target}`).classList.add("active");
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => activateTab(tab)));

  tablist.addEventListener("keydown", (e) => {
    const idx = tabs.indexOf(document.activeElement);
    if (idx < 0) return;
    let next;
    if (e.key === "ArrowRight") next = tabs[(idx + 1) % tabs.length];
    else if (e.key === "ArrowLeft") next = tabs[(idx - 1 + tabs.length) % tabs.length];
    else if (e.key === "Home") next = tabs[0];
    else if (e.key === "End") next = tabs[tabs.length - 1];
    if (next) { e.preventDefault(); activateTab(next); }
  });
});

// Module category filter
document.querySelectorAll(".module-filter").forEach((btn) => {
  btn.addEventListener("click", () => {
    const filter = btn.dataset.filter;
    const section = btn.closest(".container");

    section.querySelectorAll(".module-filter").forEach((b) =>
      b.classList.remove("active")
    );
    btn.classList.add("active");

    section.querySelectorAll(".module-card").forEach((card) => {
      if (filter === "all" || card.dataset.category === filter) {
        card.removeAttribute("data-hidden");
      } else {
        card.setAttribute("data-hidden", "");
      }
    });
  });
});

// Staggered fade-in for module cards on scroll
const fadeObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const items = entry.target.querySelectorAll(".fade-in-up");
        items.forEach((item, i) => {
          setTimeout(() => item.classList.add("visible"), i * 80);
        });
        fadeObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 },
);

document.querySelectorAll(".modules-grid").forEach((grid) => {
  grid.querySelectorAll(":scope > *").forEach((child) => {
    child.classList.add("fade-in-up");
  });
  fadeObserver.observe(grid);
});

// Fade-in for standalone elements on scroll
const elFadeObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        elFadeObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.2 },
);

document.querySelectorAll(".pitch-terminal, .expert-terminal, .cli-reference").forEach((el) => {
  el.classList.add("fade-in-up");
  elFadeObserver.observe(el);
});

// Hero stat count-up animation
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!REDUCED) {
  const stats = document.querySelectorAll(".stat-value");
  const originals = [];
  stats.forEach((el) => {
    originals.push(el.textContent);
    el.textContent = "";
  });
  setTimeout(() => {
    const duration = 800;
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      stats.forEach((el, i) => {
        const final = originals[i];
        if (final === "7") {
          el.textContent = String(Math.round(ease * 7));
        } else if (final === "3ms") {
          el.textContent = Math.round(ease * 3) + "ms";
        } else if (final === "1.2MB") {
          el.textContent = (ease * 1.2).toFixed(1) + "MB";
        } else if (final === "18") {
          el.textContent = String(Math.round(ease * 18));
        } else {
          el.textContent = final;
        }
      });
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, 400);
}

// Hero terminal parallax
if (!REDUCED) {
  const heroTerminal = document.querySelector(".hero-terminal-wrap");
  if (heroTerminal) {
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          const offset = scrollY * 0.12;
          heroTerminal.style.transform = `translateY(${offset}px)`;
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }
}

// Scroll spy for active nav indicator
const spyLinks = document.querySelectorAll('.nav-links a[href^="#"]');
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
            `.nav-links a[href="#${entry.target.id}"]`
          );
          if (active) active.classList.add("active");
        }
      });
    },
    { threshold: 0.3, rootMargin: "-56px 0px -60% 0px" },
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

  function updateButtons() {
    prevBtn.disabled = currentSlide === 0;
    nextBtn.disabled = currentSlide === total - 1;
  }

  function go(next) {
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
    slide.addEventListener("animationend", () => { animating = false; }, { once: true });
  }

  dots.forEach((dot, i) => {
    dot.addEventListener("click", () => go(i));
  });

  prevBtn.addEventListener("click", () => go(currentSlide - 1));
  nextBtn.addEventListener("click", () => go(currentSlide + 1));

  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (e.key === " " && (tag === "BUTTON" || tag === "INPUT" || tag === "TEXTAREA")) return;
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
