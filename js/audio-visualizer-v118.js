/* ============================================
   CHEMVENTUR v118 - AUDIO VISUALIZER! 📊🎵
   Splits frequencies into 3x3x3x3... recursive divisions!
   Built with 💚 by Opus for Pumpkin 🎃
   "DIVIDE THE SOUND INTO PIECES!"
   ============================================ */

(function() {
  
  CHEMVENTUR.AudioVisualizer = {
    // Audio context
    audioContext: null,
    analyser: null,
    dataArray: null,
    bufferLength: null,
    
    // Source tracking
    currentSource: null,
    sourceNode: null,
    
    // Visualization
    canvas: null,
    ctx: null,
    animationId: null,
    
    // Settings
    enabled: false,
    divisions: 3, // Split into groups of 3!
    maxDepth: 5, // How many times to split (3^5 = 243 bars!)
    
    // Visual style
    barColors: [
      '#ff00ff', '#ff00aa', '#ff0055',
      '#ff5500', '#ffaa00', '#ffff00',
      '#aaff00', '#55ff00', '#00ff00',
      '#00ff55', '#00ffaa', '#00ffff',
      '#00aaff', '#0055ff', '#0000ff',
      '#5500ff', '#aa00ff', '#ff00ff'
    ],
    
    // ===== INIT =====
    init() {
      console.log('📊 Initializing Audio Visualizer...');
      
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create analyser
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048; // More detail!
      this.bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(this.bufferLength);
      
      // Setup canvas
      this.setupCanvas();
      
      this.enabled = true;
      console.log('✅ Audio Visualizer ready!');
      console.log('📊 Frequency divisions: 3^' + this.maxDepth + ' = ' + Math.pow(3, this.maxDepth) + ' bars!');
      
      return true;
    },
    
    // ===== SETUP CANVAS =====
    setupCanvas() {
      // Create canvas overlay
      const canvas = document.createElement('canvas');
      canvas.id = 'audio-visualizer-canvas';
      canvas.style.position = 'fixed';
      canvas.style.bottom = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '200px';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '100';
      canvas.style.opacity = '0.8';
      
      document.body.appendChild(canvas);
      
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      
      // Set actual size
      this.resize();
      
      // Auto-resize
      window.addEventListener('resize', () => this.resize());
    },
    
    // ===== RESIZE =====
    resize() {
      if (!this.canvas) return;
      
      this.canvas.width = window.innerWidth;
      this.canvas.height = 200;
    },
    
    // ===== CONNECT AUDIO SOURCE =====
    connectSource(audioElement) {
      console.log('🔌 Connecting audio source to visualizer...');
      
      if (!this.enabled) this.init();
      
      try {
        // Disconnect previous source
        if (this.sourceNode) {
          this.sourceNode.disconnect();
        }
        
        // Create media element source
        this.sourceNode = this.audioContext.createMediaElementSource(audioElement);
        
        // Connect: source → analyser → destination
        this.sourceNode.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        
        // Start visualization
        this.start();
        
        console.log('✅ Audio source connected!');
        
      } catch (e) {
        console.error('Error connecting audio source:', e);
      }
    },
    
    // ===== CONNECT YOUTUBE =====
    connectYouTube(youtubePlayer) {
      console.log('🔴 Connecting YouTube player...');
      
      // For YouTube, we can't access the audio directly
      // So we'll use microphone input or skip visualization
      // This is a limitation of YouTube's iframe API
      
      console.warn('⚠️ YouTube visualization requires workaround - skipping for now');
      // Could use Web Audio API with MediaStreamSource from microphone
      // to visualize system audio, but that's complex
    },
    
    // ===== START VISUALIZATION =====
    start() {
      if (this.animationId) return; // Already running
      
      console.log('▶️ Starting visualization...');
      this.visualize();
    },
    
    // ===== STOP VISUALIZATION =====
    stop() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
        this.clearCanvas();
      }
      
      console.log('⏹️ Stopped visualization');
    },
    
    // ===== CLEAR CANVAS =====
    clearCanvas() {
      if (!this.ctx) return;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },
    
    // ===== MAIN VISUALIZATION LOOP =====
    visualize() {
      this.animationId = requestAnimationFrame(() => this.visualize());
      
      // Get frequency data
      this.analyser.getByteFrequencyData(this.dataArray);
      
      // Clear canvas
      this.clearCanvas();
      
      // Draw background
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      // Draw frequency bars with recursive 3-way splits!
      this.drawRecursiveBars();
    },
    
    // ===== DRAW RECURSIVE BARS (THE MAGIC!) =====
    drawRecursiveBars() {
      const width = this.canvas.width;
      const height = this.canvas.height;
      
      // Calculate total number of bars (3^maxDepth)
      const totalBars = Math.pow(this.divisions, this.maxDepth);
      const barWidth = width / totalBars;
      
      // Split frequencies into groups
      const freqPerBar = Math.floor(this.bufferLength / totalBars);
      
      // Draw each bar at the deepest level
      for (let i = 0; i < totalBars; i++) {
        // Get average frequency for this bar
        let sum = 0;
        for (let j = 0; j < freqPerBar; j++) {
          const index = i * freqPerBar + j;
          if (index < this.bufferLength) {
            sum += this.dataArray[index];
          }
        }
        const avg = sum / freqPerBar;
        
        // Bar height based on frequency amplitude
        const barHeight = (avg / 255) * height;
        
        // Color based on position (rainbow across spectrum)
        const colorIndex = Math.floor((i / totalBars) * this.barColors.length);
        const color = this.barColors[colorIndex % this.barColors.length];
        
        // Position
        const x = i * barWidth;
        const y = height - barHeight;
        
        // Draw bar
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, barWidth - 1, barHeight);
        
        // Add glow effect
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = color;
      }
      
      // Draw recursive grouping lines (showing the 3-way splits!)
      this.drawGroupingLines();
    },
    
    // ===== DRAW GROUPING LINES (SHOW THE SPLITS!) =====
    drawGroupingLines() {
      const width = this.canvas.width;
      const height = this.canvas.height;
      
      // Draw vertical lines showing each level of grouping
      for (let depth = 1; depth <= this.maxDepth; depth++) {
        const groups = Math.pow(this.divisions, depth);
        const groupWidth = width / groups;
        
        // Line thickness decreases with depth
        const lineWidth = Math.max(1, this.maxDepth - depth + 1);
        
        // Line opacity increases with depth
        const alpha = 0.1 + (depth / this.maxDepth) * 0.4;
        
        this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        this.ctx.lineWidth = lineWidth;
        
        for (let i = 1; i < groups; i++) {
          // Only draw at group boundaries
          if (i % this.divisions === 0) {
            const x = i * groupWidth;
            
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
          }
        }
      }
    },
    
    // ===== ALTERNATIVE: CIRCULAR VISUALIZATION =====
    visualizeCircular() {
      this.animationId = requestAnimationFrame(() => this.visualizeCircular());
      
      this.analyser.getByteFrequencyData(this.dataArray);
      
      this.clearCanvas();
      
      const width = this.canvas.width;
      const height = this.canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const maxRadius = Math.min(width, height) / 2 - 20;
      
      // Draw from center outward, splitting into 3s
      this.drawCircularRecursive(centerX, centerY, 0, Math.PI * 2, 0, maxRadius);
    },
    
    // ===== DRAW CIRCULAR RECURSIVE =====
    drawCircularRecursive(cx, cy, startAngle, endAngle, depth, maxRadius) {
      if (depth >= this.maxDepth) return;
      
      const angleSpan = endAngle - startAngle;
      const anglePerSegment = angleSpan / this.divisions;
      
      const radiusStart = (depth / this.maxDepth) * maxRadius;
      const radiusEnd = ((depth + 1) / this.maxDepth) * maxRadius;
      
      for (let i = 0; i < this.divisions; i++) {
        const segmentStart = startAngle + i * anglePerSegment;
        const segmentEnd = segmentStart + anglePerSegment;
        
        // Get frequency data for this segment
        const dataIndex = Math.floor((depth * this.divisions + i) / Math.pow(this.divisions, this.maxDepth) * this.bufferLength);
        const amplitude = this.dataArray[dataIndex] / 255;
        
        // Color
        const colorIndex = (depth * this.divisions + i) % this.barColors.length;
        const color = this.barColors[colorIndex];
        
        // Draw arc segment
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radiusStart + amplitude * (radiusEnd - radiusStart), segmentStart, segmentEnd);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = (radiusEnd - radiusStart) * 0.8;
        this.ctx.stroke();
        
        // Recurse into 3 more segments!
        this.drawCircularRecursive(cx, cy, segmentStart, segmentEnd, depth + 1, maxRadius);
      }
    },
    
    // ===== CHANGE VISUALIZATION MODE =====
    setMode(mode) {
      this.stop();
      
      if (mode === 'bars') {
        this.visualize();
      } else if (mode === 'circular') {
        this.visualizeCircular();
      }
    },
    
    // ===== SET DEPTH =====
    setDepth(depth) {
      this.maxDepth = Math.max(1, Math.min(6, depth)); // 1 to 6
      console.log('📊 Depth set to:', this.maxDepth, '(', Math.pow(3, this.maxDepth), 'bars)');
    },
    
    // ===== TOGGLE =====
    toggle() {
      if (this.animationId) {
        this.stop();
      } else {
        this.start();
      }
    },
    
    // ===== SHOW =====
    show() {
      if (this.canvas) {
        this.canvas.style.display = 'block';
      }
    },
    
    // ===== HIDE =====
    hide() {
      if (this.canvas) {
        this.canvas.style.display = 'none';
      }
    }
  };
  
  console.log('📊 Audio Visualizer module loaded!');
  console.log('🎵 Ready to split frequencies into 3x3x3x3...!');
  
})();
