/* ============================================
   CHEMVENTUR v117 - MICROPHONE → PRESSURE WAVES
   🎤 SOUND CREATES VISIBLE WAVES IN THE GRID! 🎤
   ============================================ */

(function() {
  
  CHEMVENTUR.MicrophonePressure = {
    // Audio
    audioContext: null,
    analyser: null,
    microphone: null,
    dataArray: null,
    
    // State
    enabled: false,
    active: false,
    permissionGranted: false,
    
    // Volume tracking
    currentVolume: 0,
    smoothedVolume: 0,
    volumeHistory: [],
    maxHistory: 10,
    
    // Wave spreading
    waveOriginX: 0.5, // Center of grid (0-1)
    waveOriginY: 0.5,
    waveSpeed: 2,
    waveStrength: 5,
    
    async init() {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.8;
        
        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);
        
        this.enabled = true;
        console.log('🎤 Microphone module initialized!');
        
        return true;
        
      } catch (e) {
        console.error('❌ Microphone init failed:', e);
        this.enabled = false;
        return false;
      }
    },
    
    async requestPermission() {
      if (!this.enabled) {
        await this.init();
      }
      
      if (!this.enabled) return false;
      
      try {
        console.log('🎤 Requesting microphone permission...');
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          } 
        });
        
        this.microphone = this.audioContext.createMediaStreamSource(stream);
        this.microphone.connect(this.analyser);
        
        this.permissionGranted = true;
        console.log('✅ Microphone permission granted!');
        
        return true;
        
      } catch (e) {
        console.error('❌ Microphone permission denied:', e);
        return false;
      }
    },
    
    start() {
      if (!this.permissionGranted) return false;
      
      this.active = true;
      this.volumeHistory = [];
      
      console.log('🎤 Microphone → Pressure ACTIVE!');
      return true;
    },
    
    stop() {
      this.active = false;
      this.currentVolume = 0;
      this.smoothedVolume = 0;
      this.volumeHistory = [];
      
      console.log('🎤 Microphone stopped');
    },
    
    toggle() {
      if (!this.permissionGranted) {
        return this.requestPermission();
      }
      
      if (this.active) {
        this.stop();
      } else {
        this.start();
      }
      
      return this.active;
    },
    
    // Update - call every frame!
    update() {
      if (!this.active || !this.analyser) {
        this.smoothedVolume *= 0.9;
        return;
      }
      
      // Get volume data
      this.analyser.getByteTimeDomainData(this.dataArray);
      
      // Calculate RMS volume
      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        const normalized = (this.dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      this.currentVolume = Math.sqrt(sum / this.dataArray.length);
      
      // Smooth it
      this.smoothedVolume = this.smoothedVolume * 0.8 + this.currentVolume * 0.2;
      
      // Track history
      this.volumeHistory.push(this.smoothedVolume);
      if (this.volumeHistory.length > this.maxHistory) {
        this.volumeHistory.shift();
      }
    },
    
    // Apply to pressure grid as WAVES!
    applyToPressureGrid(grid, width, height) {
      if (!this.active || !grid || !grid.enabled || !grid.cells) return;
      
      const volume = this.smoothedVolume;
      
      // Only create waves if volume is significant
      if (volume < 0.05) return;
      
      const cellsX = grid.cells[0].length;
      const cellsY = grid.cells.length;
      
      // Wave origin (center of grid)
      const originX = Math.floor(cellsX * this.waveOriginX);
      const originY = Math.floor(cellsY * this.waveOriginY);
      
      // Create circular wave spreading from origin
      for (let y = 0; y < cellsY; y++) {
        for (let x = 0; x < cellsX; x++) {
          const cell = grid.cells[y][x];
          
          // Distance from origin
          const dx = x - originX;
          const dy = y - originY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          // Wave strength decreases with distance
          const maxDist = Math.sqrt(cellsX * cellsX + cellsY * cellsY) / 2;
          const distFactor = 1 - (dist / maxDist);
          
          // Apply wave based on volume and distance
          const waveForce = volume * this.waveStrength * distFactor;
          
          // Add to pressure (creates visible ripple!)
          cell.pressure += waveForce;
          
          // Also add to temperature (makes it glow!)
          cell.temperature += volume * 0.3 * distFactor;
        }
      }
    },
    
    // Get status
    getStatus() {
      if (!this.enabled) return 'Unavailable';
      if (!this.permissionGranted) return 'Click to enable';
      if (this.active) return 'ACTIVE 🎤';
      return 'Ready (Click to start)';
    },
    
    // Get volume for UI
    getVolume() {
      return this.smoothedVolume;
    }
  };
  
  console.log('🎤 Microphone → Pressure module loaded!');
  
})();
