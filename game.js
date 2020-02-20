(() => {
  'use strict';

  const TARGET_LINGER = 250; // time target remains on screen after hit in ms

  const gfx = {
    display: document.getElementById('game-canvas'),
    layer: document.createElement('canvas'),
    clear() {
      const ctx = this.display.getContext('2d');
      ctx.clearRect(0, 0, this.display.width, this.display.height);
    },
    setCursorOpacity(opacity = 1) {
      // TODO: create a nicer cursor, perhaps a crosshair?
      // use css cursor property since canvas "drawn" cursors are laggy
      if (opacity) {
        this.display.style.cursor = `url('data:image/svg+xml;utf8,\
          <svg xmlns="http://www.w3.org/2000/svg" height="10" width="10">\
            <circle cx="5" cy="5" r="5" fill="red" opacity="${opacity}"/>\
          </svg>') 5 5, auto`;
      } else {
        this.display.style.cursor = 'none';
      }
    },
    drawTarget(target, timestamp) {
      let { x, y, radius, broken, breakX, breakY } = target;
      radius *= Math.min((timestamp - target.created) / 100, 1);
      const ctx = this.layer.getContext('2d');
      ctx.clearRect(0, 0, this.layer.width, this.layer.height);
      ctx.save();

      // "grow" the target from the break point to create a shatter effect
      if (broken) {
        const scale = Math.min(1.4, 1 + (0.4 * (timestamp - broken)) / 100);
        x = x - breakX;
        y = y - breakY;
        ctx.translate(breakX, breakY);
        ctx.scale(scale, scale);
        ctx.globalAlpha = Math.max(
          0,
          0.8 * (1 - (timestamp - broken) / TARGET_LINGER)
        );
      }
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);

      // adding color stops .01 away has an anti-aliasing effect on inner circles
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, '#bbb');
      gradient.addColorStop(0.3, '#bbb');
      gradient.addColorStop(0.31, '#eee');
      gradient.addColorStop(0.8, '#eee');
      gradient.addColorStop(0.81, '#bbb');

      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#666';
      ctx.stroke();

      // "draw" cracks
      if (broken) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1;

        target.cracks.forEach(crack => {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(
            2 * radius * Math.cos(crack.angle),
            2 * radius * Math.sin(crack.angle)
          );
          ctx.lineWidth = crack.width;
          ctx.stroke();
        });
      }

      const display = this.display.getContext('2d');
      display.drawImage(this.layer, 0, 0);

      ctx.restore();
    },
    drawBullet(x, y, delta) {
      const ctx = this.layer.getContext('2d');
      ctx.clearRect(0, 0, this.layer.width, this.layer.height);
      const radius = Math.max(
        0,
        30 * (1 - Math.abs(TARGET_LINGER - 2 * delta) / TARGET_LINGER)
      );

      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = '#888';
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = 'green';
      ctx.fill();

      const display = this.display.getContext('2d');
      display.drawImage(this.layer, 0, 0);
    },
  };

  const ui = {
    timer: document.getElementById('timer-value'),
    score: document.getElementById('game-score'),
    countdown: document.getElementById('game-countdown'),
    updateScore(score) {
      this.score.innerHTML = score;
    },
    resetTimer() {
      this.timer.classList.remove('timer-animation');
      void this.timer.offsetWidth;
      this.timer.classList.add('timer-animation');
    },
    showCountdown(num = 3) {
      this.countdown.innerHTML = `<div>${num || 'Invis!'}</div>`;
      this.countdown.classList.remove('game-countdown_fade');
      void this.countdown.offsetWidth;
      this.countdown.classList.add('game-countdown_fade');

      if (num) {
        this.countdown.onanimationend = () => this.showCountdown(--num);
      } else {
        this.countdown.onanimationend = null;
        this.resetTimer();
      }
    },
    hideScreens() {
      document.getElementById('game-start').classList.add('_hidden');
      document.getElementById('game-over').classList.add('_hidden');
    },
    gameover(score) {
      document.getElementById('final-score').innerHTML = score;
      document.getElementById('game-over').classList.remove('_hidden');
    },
  };

  const bgm = new Audio('bgm.wav');
  bgm.addEventListener(
    'canplay',
    () => {
      bgm.loop = true;
      bgm.volume = 0.15;
      document.getElementById('game-credits').innerHTML = 'BGM by oo39.com';
    },
    { once: true }
  );

  const shatter = new Audio('shatter.wav');
  shatter.volume = 0.15;

  let width = 640;
  let height = 480;
  let score = 0;
  let targets = [];
  let timeLimit = 0;
  let cursorFade = 0;
  let missed = false;

  function setDimensions() {
    let container = document.getElementById('game');
    width = gfx.display.width = gfx.layer.width = container.offsetWidth;
    height = gfx.display.height = gfx.layer.height = container.offsetHeight;
  }

  function spawnTarget(timestamp) {
    targets.push({
      x: (0.1 + 0.8 * Math.random()) * width,
      y: (0.1 + 0.8 * Math.random()) * height,
      radius: 80 + 40 * Math.random(),
      created: timestamp,
      broken: 0,
      breakX: 0,
      breakY: 0,
      cracks: [],
    });
  }

  function shoot(e) {
    const rect = gfx.display.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (let i = 0; i < targets.length; ++i) {
      const target = targets[i];
      if (!target.broken) {
        const distance = Math.sqrt((x - target.x) ** 2 + (y - target.y) ** 2);

        if (distance <= target.radius) {
          target.broken = e.timeStamp;
          target.breakX = x;
          target.breakY = y;

          // generate the cracks
          let angle = 0.12 * Math.random();
          while (angle < 2) {
            let width = 8 + 16 * Math.random();
            target.cracks.push({ angle: angle * Math.PI, width: width });
            angle += 0.12 + 0.35 * Math.random();
          }

          ++score;
          ui.updateScore(score);

          if (timeLimit < e.timeStamp + 1000) {
            timeLimit = e.timeStamp + 1000;
            ui.resetTimer();
          }

          shatter.currentTime = 0;
          shatter.play();

          return;
        }
      }
    }

    missed = true;

    // draw the missed bullet
    gfx.drawBullet(x, y, 0);
  }

  function step(timestamp) {
    if (missed || timestamp > timeLimit) {
      bgm.pause();
      bgm.currentTime = 0;
      ui.gameover(score);
      return;
    }

    gfx.setCursorOpacity(Math.max((cursorFade - timestamp) / 1000, 0));

    // clear targets that have lingered enough after being hit
    targets = targets.filter(
      target => !target.broken || target.broken + TARGET_LINGER > timestamp
    );

    while (targets.length < 3) {
      spawnTarget(timestamp);
    }

    gfx.clear();
    // draw targets in reverse since earlier targets should be hit first
    for (let i = targets.length - 1; i >= 0; --i) {
      const target = targets[i];
      gfx.drawTarget(target, timestamp);
      if (target.broken) {
        gfx.drawBullet(target.breakX, target.breakY, timestamp - target.broken);
      }
    }

    window.requestAnimationFrame(step);
  }

  function startGame() {
    score = 0;
    missed = false;
    targets = [];
    cursorFade = timeLimit = performance.now() + 4000;
    ui.hideScreens();
    ui.timer.classList.remove('timer-animation');
    window.requestAnimationFrame(step);
    ui.showCountdown();
    bgm.play();
  }

  setDimensions();
  window.onresize = setDimensions;
  gfx.display.addEventListener('click', shoot);
  const gameButtons = document.getElementsByClassName('game-btn');
  for (let i = 0; i < gameButtons.length; ++i) {
    gameButtons[i].addEventListener('click', startGame);
  }
})();
