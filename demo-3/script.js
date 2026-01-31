// JavaScript for the hero slider component

document.addEventListener('DOMContentLoaded', function () {
    const slides = document.querySelectorAll('.hero .slide');
    const nextBtn = document.querySelector('.hero .next');
    const prevBtn = document.querySelector('.hero .prev');
    let current = 0;
    let timer;

    // Show the slide corresponding to the index
    function showSlide(index) {
        slides.forEach((slide, i) => {
            slide.classList.remove('active');
            if (i === index) {
                slide.classList.add('active');
            }
        });
    }

    // Go to the next slide
    function nextSlide() {
        current = (current + 1) % slides.length;
        showSlide(current);
    }

    // Go to the previous slide
    function prevSlide() {
        current = (current - 1 + slides.length) % slides.length;
        showSlide(current);
    }

    // Start automatic cycling
    function startAuto() {
        timer = setInterval(nextSlide, 8000);
    }

    // Stop automatic cycling
    function stopAuto() {
        clearInterval(timer);
    }

    // Event listeners for next and previous buttons
    nextBtn.addEventListener('click', () => {
        stopAuto();
        nextSlide();
        startAuto();
    });

    prevBtn.addEventListener('click', () => {
        stopAuto();
        prevSlide();
        startAuto();
    });

    // Pause auto slide on mouse enter and resume on leave
    const heroSection = document.querySelector('.hero');
    heroSection.addEventListener('mouseenter', stopAuto);
    heroSection.addEventListener('mouseleave', startAuto);

    // Initialize slider
    showSlide(current);
    startAuto();
});