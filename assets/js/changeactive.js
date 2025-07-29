function changeActiveLink(clickedLink) {
      // Remove 'active' class from all links
      var links = document.querySelectorAll('.navbar-nav .nav-link');
      links.forEach(function (link) {
        link.classList.remove('active');
      });

      // Add 'active' class to the clicked link
      clickedLink.classList.add('active');
    }