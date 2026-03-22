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
