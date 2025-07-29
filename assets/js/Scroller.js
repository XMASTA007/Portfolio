var isUserScrolling = false;

// Add event listener for manual scrolling
window.addEventListener("scroll", function () {
    isUserScrolling = true;
});

function scrollToProjects() {
    // Check if the user is scrolling manually
    if (isUserScrolling) {
        return; // Do nothing if the user is scrolling
    }

    var navbarHeight = 100; // Height of the navigation bar
    var element = document.getElementById("Projects");
    var start = window.scrollY + navbarHeight; // Adjusted starting point for the nav bar
    var end = element.getBoundingClientRect().top + window.scrollY - navbarHeight; // Adjusted end point
    var duration = 1000; // Set the duration of the scroll animation (in milliseconds)
    var startTime;

    function scrollAnimation(currentTime) {
        if (!startTime) startTime = currentTime;
        var progress = currentTime - startTime;

        window.scrollTo(0, easeInOutQuad(progress, start, end - start, duration));

        if (progress < duration) {
            requestAnimationFrame(scrollAnimation);
        }
    }

    function easeInOutQuad(t, b, c, d) {
        t /= d / 2;
        if (t < 1) return c / 2 * t * t + b;
        t--;
        return -c / 2 * (t * (t - 2) - 1) + b;
    }

    requestAnimationFrame(scrollAnimation);
}

setTimeout(scrollToProjects, 5000); // Adjust the time delay (in milliseconds) according to your needs