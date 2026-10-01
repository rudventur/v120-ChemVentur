/* ============================================
   CHEMVENTUR v118 - MUSIC PLAYER SYSTEM! 🎵
   Play music from YouTube, SoundCloud, local files!
   Built with 💚 by Opus for Pumpkin 🎃
   ============================================ */

(function() {
  
  CHEMVENTUR.MusicPlayer = {
    // State
    enabled: false,
    playing: false,
    volume: 0.5,
    currentSource: null, // 'youtube', 'soundcloud', 'local', 'url'
    
    // Players
    youtubePlayer: null,
    soundcloudWidget: null,
    audioElement: null,
    
    // YouTube API
    youtubeAPIReady: false,
    youtubePlayerReady: false,
    
    // Current track info
    currentTrack: {
      title: '',
      source: '',
      url: ''
    },
    
    // ===== INIT =====
    init() {
      console.log('🎵 Initializing Music Player System...');
      
      // Create audio element for local/URL playback
      this.audioElement = new Audio();
      this.audioElement.volume = this.volume;
      this.audioElement.loop = true;
      
      // Setup UI
      this.setupUI();
      
      // Load YouTube API
      this.loadYouTubeAPI();
      
      // SoundCloud Widget API is loaded via script tag in HTML
      
      this.enabled = true;
      console.log('✅ Music Player ready!');
      
      return true;
    },
    
    // ===== SETUP UI =====
    setupUI() {
      console.log('🎨 Setting up Music Player UI...');
      
      const musicHTML = `
        <div id="music-player-window" class="music-player-container">
          <div class="music-header">
            <span>🎵 Music Player</span>
            <button class="music-close" id="music-close">✕</button>
          </div>
          
          <div class="music-content">
            <!-- Source Selection -->
            <div class="music-section">
              <label class="music-label">🎼 Music Source:</label>
              <div class="music-source-buttons">
                <button class="music-source-btn active" data-source="youtube">YouTube</button>
                <button class="music-source-btn" data-source="soundcloud">SoundCloud</button>
                <button class="music-source-btn" data-source="local">Local File</button>
                <button class="music-source-btn" data-source="url">Direct URL</button>
              </div>
            </div>
            
            <!-- YouTube Section -->
            <div class="music-input-section" id="youtube-section">
              <label class="music-label">🔴 YouTube Video URL or ID:</label>
              <input type="text" id="youtube-input" class="music-input" placeholder="https://youtube.com/watch?v=... or video ID">
              <button id="youtube-play" class="music-btn">▶️ Play YouTube</button>
              <div class="music-help">Examples: dQw4w9WgXcQ or full YouTube URL</div>
            </div>
            
            <!-- SoundCloud Section -->
            <div class="music-input-section hidden" id="soundcloud-section">
              <label class="music-label">🟠 SoundCloud Track URL:</label>
              <input type="text" id="soundcloud-input" class="music-input" placeholder="https://soundcloud.com/...">
              <button id="soundcloud-play" class="music-btn">▶️ Play SoundCloud</button>
              <div class="music-help">Paste full SoundCloud track URL</div>
            </div>
            
            <!-- Local File Section -->
            <div class="music-input-section hidden" id="local-section">
              <label class="music-label">📁 Local Audio File:</label>
              <input type="file" id="local-file-input" accept="audio/*" class="music-file-input">
              <button id="local-play" class="music-btn">▶️ Play Local File</button>
              <div class="music-help">MP3, WAV, OGG, etc.</div>
            </div>
            
            <!-- Direct URL Section -->
            <div class="music-input-section hidden" id="url-section">
              <label class="music-label">🌐 Direct Audio URL:</label>
              <input type="text" id="url-input" class="music-input" placeholder="https://example.com/song.mp3">
              <button id="url-play" class="music-btn">▶️ Play from URL</button>
              <div class="music-help">Direct link to MP3/audio file</div>
            </div>
            
            <!-- Player Container -->
            <div class="music-player-embed" id="music-player-embed">
              <!-- YouTube/SoundCloud player will load here -->
            </div>
            
            <!-- Now Playing -->
            <div class="music-now-playing" id="music-now-playing">
              <div class="music-label">♪ Now Playing:</div>
              <div id="music-track-info">No music loaded</div>
            </div>
            
            <!-- Controls -->
            <div class="music-controls">
              <button id="music-play-pause" class="music-control-btn" disabled>▶️</button>
              <button id="music-stop" class="music-control-btn" disabled>⏹️</button>
              <div class="music-volume-control">
                <span>🔊</span>
                <input type="range" id="music-volume" min="0" max="100" value="50" class="music-volume-slider">
                <span id="music-volume-text">50%</span>
              </div>
            </div>
          </div>
        </div>
      `;
      
      // Add to page
      document.body.insertAdjacentHTML('beforeend', musicHTML);
      
      // Get references
      this.musicWindow = document.getElementById('music-player-window');
      this.playerEmbed = document.getElementById('music-player-embed');
      
      // Setup event listeners
      this.setupEventListeners();
      
      console.log('✅ Music Player UI ready!');
    },
    
    // ===== SETUP EVENT LISTENERS =====
    setupEventListeners() {
      // Close button
      document.getElementById('music-close').addEventListener('click', () => {
        this.closeUI();
      });
      
      // Source buttons
      document.querySelectorAll('.music-source-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          this.switchSource(e.target.dataset.source);
        });
      });
      
      // YouTube play
      document.getElementById('youtube-play').addEventListener('click', () => {
        const input = document.getElementById('youtube-input').value;
        if (input) this.playYouTube(input);
      });
      
      // SoundCloud play
      document.getElementById('soundcloud-play').addEventListener('click', () => {
        const input = document.getElementById('soundcloud-input').value;
        if (input) this.playSoundCloud(input);
      });
      
      // Local file play
      document.getElementById('local-play').addEventListener('click', () => {
        const fileInput = document.getElementById('local-file-input');
        if (fileInput.files.length > 0) {
          this.playLocalFile(fileInput.files[0]);
        }
      });
      
      // URL play
      document.getElementById('url-play').addEventListener('click', () => {
        const input = document.getElementById('url-input').value;
        if (input) this.playURL(input);
      });
      
      // Play/Pause
      document.getElementById('music-play-pause').addEventListener('click', () => {
        this.togglePlayPause();
      });
      
      // Stop
      document.getElementById('music-stop').addEventListener('click', () => {
        this.stop();
      });
      
      // Volume
      document.getElementById('music-volume').addEventListener('input', (e) => {
        const vol = e.target.value / 100;
        this.setVolume(vol);
        document.getElementById('music-volume-text').textContent = e.target.value + '%';
      });
    },
    
    // ===== SWITCH SOURCE =====
    switchSource(source) {
      // Update buttons
      document.querySelectorAll('.music-source-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      event.target.classList.add('active');
      
      // Hide all sections
      document.querySelectorAll('.music-input-section').forEach(section => {
        section.classList.add('hidden');
      });
      
      // Show selected section
      document.getElementById(source + '-section').classList.remove('hidden');
      
      this.currentSource = source;
    },
    
    // ===== LOAD YOUTUBE API =====
    loadYouTubeAPI() {
      if (window.YT && window.YT.Player) {
        this.youtubeAPIReady = true;
        console.log('✅ YouTube API already loaded!');
        return;
      }
      
      // Load YouTube IFrame API
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      
      // YouTube API ready callback
      window.onYouTubeIframeAPIReady = () => {
        this.youtubeAPIReady = true;
        console.log('✅ YouTube API loaded!');
      };
    },
    
    // ===== PLAY YOUTUBE =====
    async playYouTube(input) {
      console.log('🔴 Loading YouTube:', input);
      
      // Wait for API
      if (!this.youtubeAPIReady) {
        this.showStatus('⏳ Loading YouTube API...');
        await this.waitForYouTubeAPI();
      }
      
      // Extract video ID
      let videoId = input;
      if (input.includes('youtube.com') || input.includes('youtu.be')) {
        const urlParams = new URLSearchParams(new URL(input).search);
        videoId = urlParams.get('v') || input.split('/').pop().split('?')[0];
      }
      
      console.log('Video ID:', videoId);
      
      // Clear previous
      this.stop();
      this.playerEmbed.innerHTML = '<div id="youtube-player"></div>';
      
      // Create YouTube player
      this.youtubePlayer = new YT.Player('youtube-player', {
        height: '200',
        width: '100%',
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          loop: 1,
          playlist: videoId // For looping
        },
        events: {
          onReady: (event) => {
            this.youtubePlayerReady = true;
            event.target.setVolume(this.volume * 100);
            event.target.playVideo();
            this.playing = true;
            this.updateControls();
            this.showStatus('🔴 Playing YouTube!');
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.ENDED) {
              event.target.playVideo(); // Loop
            }
          }
        }
      });
      
      this.currentTrack = {
        title: 'YouTube Video',
        source: 'youtube',
        url: input
      };
      
      this.updateNowPlaying();
    },
    
    // ===== PLAY SOUNDCLOUD =====
    playSoundCloud(url) {
      console.log('🟠 Loading SoundCloud:', url);
      
      // Clear previous
      this.stop();
      
      // Create SoundCloud iframe
      const iframe = document.createElement('iframe');
      iframe.width = '100%';
      iframe.height = '200';
      iframe.scrolling = 'no';
      iframe.frameborder = 'no';
      iframe.allow = 'autoplay';
      iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&buying=false&sharing=false&show_artwork=true&show_playcount=false`;
      
      this.playerEmbed.innerHTML = '';
      this.playerEmbed.appendChild(iframe);
      
      // Initialize SoundCloud Widget API
      if (window.SC && window.SC.Widget) {
        this.soundcloudWidget = SC.Widget(iframe);
        
        this.soundcloudWidget.bind(SC.Widget.Events.READY, () => {
          this.soundcloudWidget.setVolume(this.volume * 100);
          this.soundcloudWidget.play();
          this.playing = true;
          this.updateControls();
          this.showStatus('🟠 Playing SoundCloud!');
          
          // Get track info
          this.soundcloudWidget.getCurrentSound((sound) => {
            if (sound) {
              this.currentTrack = {
                title: sound.title,
                source: 'soundcloud',
                url: url
              };
              this.updateNowPlaying();
            }
          });
        });
        
        // Loop track
        this.soundcloudWidget.bind(SC.Widget.Events.FINISH, () => {
          this.soundcloudWidget.seekTo(0);
          this.soundcloudWidget.play();
        });
      }
      
      this.currentTrack = {
        title: 'SoundCloud Track',
        source: 'soundcloud',
        url: url
      };
      
      this.updateNowPlaying();
    },
    
    // ===== PLAY LOCAL FILE =====
    playLocalFile(file) {
      console.log('📁 Loading local file:', file.name);
      
      // Clear previous
      this.stop();
      this.playerEmbed.innerHTML = '';
      
      // Create URL for file
      const fileURL = URL.createObjectURL(file);
      
      // Play in audio element
      this.audioElement.src = fileURL;
      this.audioElement.volume = this.volume;
      this.audioElement.loop = true;
      this.audioElement.play();
      
      // 📊 CONNECT TO VISUALIZER! 🎵
      if (CHEMVENTUR.AudioVisualizer) {
        CHEMVENTUR.AudioVisualizer.connectSource(this.audioElement);
        CHEMVENTUR.AudioVisualizer.show();
      }
      
      this.playing = true;
      this.updateControls();
      this.showStatus('📁 Playing local file with visualizer! 📊');
      
      this.currentTrack = {
        title: file.name,
        source: 'local',
        url: fileURL
      };
      
      this.updateNowPlaying();
    },
    
    // ===== PLAY URL =====
    playURL(url) {
      console.log('🌐 Loading URL:', url);
      
      // Clear previous
      this.stop();
      this.playerEmbed.innerHTML = '';
      
      // Play in audio element
      this.audioElement.src = url;
      this.audioElement.volume = this.volume;
      this.audioElement.loop = true;
      this.audioElement.play();
      
      // 📊 CONNECT TO VISUALIZER! 🎵
      if (CHEMVENTUR.AudioVisualizer) {
        CHEMVENTUR.AudioVisualizer.connectSource(this.audioElement);
        CHEMVENTUR.AudioVisualizer.show();
      }
      
      this.playing = true;
      this.updateControls();
      this.showStatus('🌐 Playing from URL with visualizer! 📊');
      
      this.currentTrack = {
        title: url.split('/').pop(),
        source: 'url',
        url: url
      };
      
      this.updateNowPlaying();
    },
    
    // ===== TOGGLE PLAY/PAUSE =====
    togglePlayPause() {
      if (!this.currentTrack.source) return;
      
      if (this.playing) {
        this.pause();
      } else {
        this.play();
      }
    },
    
    // ===== PLAY =====
    play() {
      switch (this.currentTrack.source) {
        case 'youtube':
          if (this.youtubePlayer && this.youtubePlayerReady) {
            this.youtubePlayer.playVideo();
          }
          break;
        case 'soundcloud':
          if (this.soundcloudWidget) {
            this.soundcloudWidget.play();
          }
          break;
        case 'local':
        case 'url':
          this.audioElement.play();
          break;
      }
      
      this.playing = true;
      this.updateControls();
    },
    
    // ===== PAUSE =====
    pause() {
      switch (this.currentTrack.source) {
        case 'youtube':
          if (this.youtubePlayer && this.youtubePlayerReady) {
            this.youtubePlayer.pauseVideo();
          }
          break;
        case 'soundcloud':
          if (this.soundcloudWidget) {
            this.soundcloudWidget.pause();
          }
          break;
        case 'local':
        case 'url':
          this.audioElement.pause();
          break;
      }
      
      this.playing = false;
      this.updateControls();
    },
    
    // ===== STOP =====
    stop() {
      // Stop YouTube
      if (this.youtubePlayer && this.youtubePlayerReady) {
        this.youtubePlayer.stopVideo();
        this.youtubePlayer.destroy();
        this.youtubePlayer = null;
        this.youtubePlayerReady = false;
      }
      
      // Stop SoundCloud
      if (this.soundcloudWidget) {
        this.soundcloudWidget.pause();
        this.soundcloudWidget = null;
      }
      
      // Stop audio element
      this.audioElement.pause();
      this.audioElement.src = '';
      
      // Hide visualizer
      if (CHEMVENTUR.AudioVisualizer) {
        CHEMVENTUR.AudioVisualizer.stop();
        CHEMVENTUR.AudioVisualizer.hide();
      }
      
      // Clear embed
      this.playerEmbed.innerHTML = '';
      
      this.playing = false;
      this.currentTrack = { title: '', source: '', url: '' };
      this.updateNowPlaying();
      this.updateControls();
    },
    
    // ===== SET VOLUME =====
    setVolume(vol) {
      this.volume = Math.max(0, Math.min(1, vol));
      
      // Update all players
      if (this.youtubePlayer && this.youtubePlayerReady) {
        this.youtubePlayer.setVolume(this.volume * 100);
      }
      
      if (this.soundcloudWidget) {
        this.soundcloudWidget.setVolume(this.volume * 100);
      }
      
      this.audioElement.volume = this.volume;
    },
    
    // ===== UPDATE CONTROLS =====
    updateControls() {
      const playBtn = document.getElementById('music-play-pause');
      const stopBtn = document.getElementById('music-stop');
      
      if (this.currentTrack.source) {
        playBtn.disabled = false;
        stopBtn.disabled = false;
        playBtn.textContent = this.playing ? '⏸️' : '▶️';
      } else {
        playBtn.disabled = true;
        stopBtn.disabled = true;
        playBtn.textContent = '▶️';
      }
    },
    
    // ===== UPDATE NOW PLAYING =====
    updateNowPlaying() {
      const trackInfo = document.getElementById('music-track-info');
      
      if (this.currentTrack.title) {
        const sourceEmoji = {
          youtube: '🔴',
          soundcloud: '🟠',
          local: '📁',
          url: '🌐'
        };
        
        trackInfo.innerHTML = `
          ${sourceEmoji[this.currentTrack.source]} 
          <strong>${this.currentTrack.title}</strong>
        `;
      } else {
        trackInfo.textContent = 'No music loaded';
      }
    },
    
    // ===== SHOW STATUS =====
    showStatus(message) {
      if (CHEMVENTUR.UI && CHEMVENTUR.UI.showStatus) {
        CHEMVENTUR.UI.showStatus(message, 3000);
      }
      console.log('🎵', message);
    },
    
    // ===== WAIT FOR YOUTUBE API =====
    waitForYouTubeAPI() {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (this.youtubeAPIReady) {
            clearInterval(check);
            resolve();
          }
        }, 100);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(check);
          resolve();
        }, 10000);
      });
    },
    
    // ===== OPEN UI =====
    openUI() {
      this.musicWindow.style.display = 'flex';
    },
    
    // ===== CLOSE UI =====
    closeUI() {
      this.musicWindow.style.display = 'none';
    },
    
    // ===== TOGGLE UI =====
    toggleUI() {
      if (this.musicWindow.style.display === 'none') {
        this.openUI();
      } else {
        this.closeUI();
      }
    }
  };
  
  console.log('🎵 Music Player module loaded!');
  
})();
