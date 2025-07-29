function checkVisibility() {
   var projects = document.querySelectorAll(".project");

   projects.forEach(function (project) {
      var projectImage = project.querySelector(".projectImage");
      var projectText = project.querySelector(".project_text");

      // Get the position of the project div
      var projectPosition = project.getBoundingClientRect().top;
      var windowHeight = window.innerHeight;

      // Check if the project div is in the viewport or close to it
      if (projectPosition < windowHeight - 300) {
         // Fade in the image and text by setting their opacity to 1
         projectImage.style.opacity = "1";
         projectText.style.opacity = "1";
      }
   });
}

// Check visibility on page load
checkVisibility();

// Listen for the scroll event
document.addEventListener("scroll", checkVisibility);
