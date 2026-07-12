"use strict";

/*
==========================================================
SPOT SKETCH

Module:
Welcome

Purpose:
Handles the welcome screen logo animation.

Table of Contents:
1. Welcome Logo Animation

Owns:
- welcome logo entrance animation

Does NOT own:
- image loading
- project metadata
- markers
- exposure calculations
- welcome screen layout

Dependencies:
- none
==========================================================
*/


/*
────────────────────────────────────────────
1. Welcome Logo Animation
────────────────────────────────────────────
*/

/*
  Animates the welcome logo with a soft rolling bounce.

  The animation is intentionally custom instead of CSS-only because it
  combines horizontal travel, rotation, opacity, squash, and stretch.
*/
function animateWelcomeLogo() {
  const logo = document.querySelector(".welcome-logo");
  if (!logo) return;

  /*
    Motion state.

    x starts off-screen to the left and moves toward the final target.
  */
  let x = -260;
  let velocity = 0;

  /*
    Motion constants.

    These values are tuned visually for a soft, playful entrance.
  */
  const target = 0;
  const startX = x;
  const radius = 8;

  const gravity = 0.17;
  const damping = 0.70;
  const airResistance = 0.987;

  /*
    Bounce limiter.

    Prevents the logo from bouncing forever on slow devices or unusual
    animation timing.
  */
  let bounceCount = 0;
  const maxBounces = 4;

  logo.style.opacity = "0";

  function frame() {
    velocity += gravity;
    velocity *= airResistance;
    x += velocity;

    /*
      Fade in while the logo approaches the visible area.
    */
    const progress = Math.min(1, Math.max(0, (x + 260) / 120));
    logo.style.opacity = progress;

    let squash = 1;
    let stretch = 1;

    /*
      Bounce when the logo reaches its final horizontal position.
    */
    if (x >= target) {
      x = target;
      bounceCount += 1;

      squash = 1.16;
      stretch = 0.84;

      if (bounceCount >= maxBounces || Math.abs(velocity) < 1.1) {
        logo.style.opacity = "1";
        logo.style.transform = "translateX(0) rotate(0deg) scale(1)";
        return;
      }

      velocity = -Math.abs(velocity) * damping;
    }

    /*
      Add a subtle stretch while the logo travels upward after a bounce.
    */
    if (velocity < -0.8 && x < target) {
      squash = 0.94;
      stretch = 1.06;
    }

    /*
      Rotation is derived from traveled distance, giving the logo the
      feeling of rolling into place.
    */
    const travel = x - startX;
    const rotation = (travel / (2 * Math.PI * radius)) * 360;

    logo.style.transform =
      `translateX(${x}px)
       rotate(${rotation}deg)
       scaleX(${squash})
       scaleY(${stretch})`;

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}