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

// Tab switching
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    const container = tab.closest(".code-tabs");

    container
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.remove("active"));
    container
      .querySelectorAll(".tab-panel")
      .forEach((p) => p.classList.remove("active"));

    tab.classList.add("active");
    container.querySelector(`#tab-${target}`).classList.add("active");
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

// Install method switching
document.querySelectorAll(".install-method").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.method;
    const step = btn.closest(".start-step");

    step.querySelectorAll(".install-method").forEach((b) =>
      b.classList.remove("active")
    );
    step.querySelectorAll(".install-panel").forEach((p) =>
      p.classList.remove("active")
    );

    btn.classList.add("active");
    step.querySelector(`[data-install="${target}"]`).classList.add("active");
  });
});

// Animate benchmark bars on scroll
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll(".bench-bar[data-animate]").forEach(
          (bar, i) => {
            setTimeout(() => bar.classList.add("animated"), i * 80);
          },
        );
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.2 },
);

const benchGrid = document.querySelector(".bench-grid");
if (benchGrid) observer.observe(benchGrid);

// Scroll progress bar
const scrollProgress = document.querySelector(".scroll-progress");
if (scrollProgress) {
  window.addEventListener("scroll", () => {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight > 0) {
      scrollProgress.style.width = (window.scrollY / docHeight * 100) + "%";
    }
  }, { passive: true });
}

// Staggered fade-in for cards and elements on scroll
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

document.querySelectorAll(".features-grid, .cold-start-grid, .start-grid, .modules-grid, .subset-grid, .zts-proofs-grid").forEach((grid) => {
  grid.querySelectorAll(":scope > *").forEach((child) => {
    child.classList.add("fade-in-up");
  });
  fadeObserver.observe(grid);
});

// Comparison table row-by-row reveal
const cmpObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll(".cmp-row").forEach((row, i) => {
          row.classList.add("fade-in-up");
          setTimeout(() => row.classList.add("visible"), i * 60);
        });
        cmpObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1 },
);

const cmpTable = document.querySelector(".cmp");
if (cmpTable) cmpObserver.observe(cmpTable);

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
  }, 600);
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
