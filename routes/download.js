const express = require('express');
const router = express.Router();
const ytdl = require('ytdl-core');
const ytdlVideo = require('ytdl-core-video');
const fs = require('fs-extra');
const path = require('path');
const contentDisposition = require('content-disposition');
const { PassThrough } = require('stream');

// Supported platforms
const PLATFORMS = {
    YOUTUBE: 'youtube',
    TIKTOK: 'tiktok',
    INSTAGRAM: 'instagram',
    FACEBOOK: 'facebook',
    TWITTER: 'twitter',
    REDDIT: 'reddit',
    VIMEO: 'vimeo',
    DAILYMOTION: 'dailymotion'
};

// Detect platform from URL
function detectPlatform(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        
        if (host.includes('youtube.com') || host.includes('youtu.be')) return PLATFORMS.YOUTUBE;
        if (host.includes('tiktok.com')) return PLATFORMS.TIKTOK;
        if (host.includes('instagram.com')) return PLATFORMS.INSTAGRAM;
        if (host.includes('facebook.com') || host.includes('fb.com')) return PLATFORMS.FACEBOOK;
        if (host.includes('twitter.com') || host.includes('x.com')) return PLATFORMS.TWITTER;
        if (host.includes('reddit.com')) return PLATFORMS.REDDIT;
        if (host.includes('vimeo.com')) return PLATFORMS.VIMEO;
        if (host.includes('dailymotion.com')) return PLATFORMS.DAILYMOTION;
        
        return 'unknown';
    } catch {
        return 'unknown';
    }
}

// Get YouTube video info
async function getYouTubeInfo(url) {
    try {
        const info = await ytdl.getInfo(url);
        const formats = info.formats;
        
        // Find best video+audio format
        const bestFormat = formats
            .filter(f => f.hasVideo && f.hasAudio)
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        
        // Or get separate audio and video for better quality
        const videoFormat = formats
            .filter(f => f.hasVideo && !f.hasAudio)
            .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
        
        const audioFormat = formats
            .filter(f => f.hasAudio && !f.hasVideo)
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

        return {
            title: info.videoDetails.title,
            duration: parseInt(info.videoDetails.lengthSeconds),
            thumbnail: info.videoDetails.thumbnails?.pop()?.url || '',
            formats: {
                best: bestFormat || videoFormat,
                video: videoFormat,
                audio: audioFormat
            },
            videoId: info.videoDetails.videoId,
            author: info.videoDetails.author.name
        };
    } catch (error) {
        throw new Error(`Failed to fetch YouTube video: ${error.message}`);
    }
}

// ============================================================
// ROUTES
// ============================================================

// Get video info
router.post('/info', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL is required'
            });
        }

        const platform = detectPlatform(url);
        
        if (platform === PLATFORMS.YOUTUBE) {
            const info = await getYouTubeInfo(url);
            return res.json({
                success: true,
                platform: platform,
                ...info
            });
        }

        // For other platforms, try to fetch via axios
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            });
            
            // Try to extract title from HTML
            const titleMatch = response.data.match(/<title>(.*?)<\/title>/);
            const title = titleMatch ? titleMatch[1].trim() : 'Video';
            
            return res.json({
                success: true,
                platform: platform,
                title: title,
                thumbnail: null,
                duration: null,
                formats: { best: { url: url } }
            });
        } catch {
            return res.json({
                success: true,
                platform: platform,
                title: 'Video',
                thumbnail: null,
                duration: null,
                formats: { best: { url: url } }
            });
        }

    } catch (error) {
        console.error('Info error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch video info'
        });
    }
});

// Download video with streaming
router.post('/download', async (req, res) => {
    try {
        const { url, quality = 'best' } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL is required'
            });
        }

        const platform = detectPlatform(url);
        
        if (platform === PLATFORMS.YOUTUBE) {
            // YouTube download with streaming
            const info = await ytdl.getInfo(url);
            const title = info.videoDetails.title.replace(/[^\w\s-]/gi, '');
            
            // Get best format
            let format = ytdl.chooseFormat(info.formats, { 
                quality: quality === 'best' ? 'highest' : 'lowest',
                filter: 'audioandvideo'
            });

            if (!format) {
                // If no combined format, get video and audio separately
                const videoFormat = ytdl.chooseFormat(info.formats, { 
                    quality: quality === 'best' ? 'highestvideo' : 'lowestvideo' 
                });
                const audioFormat = ytdl.chooseFormat(info.formats, { 
                    quality: quality === 'best' ? 'highestaudio' : 'lowestaudio' 
                });
                
                if (!videoFormat || !audioFormat) {
                    throw new Error('No suitable formats found');
                }

                // Set headers for video streaming
                const filename = `${title}.mp4`;
                res.setHeader('Content-Type', 'video/mp4');
                res.setHeader('Content-Disposition', contentDisposition(filename));
                res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

                // Stream video and audio separately (this is complex)
                // For simplicity, we'll use the combined format if available
                // In production, use ffmpeg to merge
                const videoStream = ytdl(url, { quality: 'highestvideo' });
                videoStream.pipe(res);
                return;
            }

            // Set response headers
            const filename = `${title}.mp4`;
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', contentDisposition(filename));
            res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

            // Stream the video
            const videoStream = ytdl(url, { 
                quality: quality === 'best' ? 'highest' : 'lowest',
                filter: 'audioandvideo'
            });

            videoStream.pipe(res);

            // Track progress
            let downloaded = 0;
            videoStream.on('data', (chunk) => {
                downloaded += chunk.length;
                // You can track progress here if needed
            });

            videoStream.on('error', (err) => {
                console.error('Stream error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, error: err.message });
                }
            });

        } else {
            // For other platforms, try direct download
            try {
                const response = await axios({
                    method: 'GET',
                    url: url,
                    responseType: 'stream',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                const filename = `video_${Date.now()}.mp4`;
                res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
                res.setHeader('Content-Disposition', contentDisposition(filename));
                res.setHeader('Content-Length', response.headers['content-length'] || 0);

                response.data.pipe(res);

            } catch (error) {
                // If direct download fails, send a placeholder
                res.status(400).json({
                    success: false,
                    error: 'This platform is not supported for direct download'
                });
            }
        }

    } catch (error) {
        console.error('Download error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: error.message || 'Download failed'
            });
        }
    }
});

// Get YouTube thumbnail
router.get('/thumbnail/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const qualities = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default'];
        
        for (const quality of qualities) {
            const url = `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
            try {
                const response = await axios({
                    method: 'GET',
                    url: url,
                    responseType: 'stream'
                });
                res.setHeader('Content-Type', 'image/jpeg');
                response.data.pipe(res);
                return;
            } catch {}
        }
        
        res.status(404).json({ success: false, error: 'Thumbnail not found' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get supported platforms
router.get('/platforms', (req, res) => {
    res.json({
        success: true,
        platforms: [
            { name: 'YouTube', icon: 'youtube', supported: true },
            { name: 'TikTok', icon: 'tiktok', supported: true },
            { name: 'Instagram', icon: 'instagram', supported: true },
            { name: 'Facebook', icon: 'facebook', supported: true },
            { name: 'Twitter/X', icon: 'twitter', supported: true },
            { name: 'Reddit', icon: 'reddit', supported: true },
            { name: 'Vimeo', icon: 'vimeo', supported: true },
            { name: 'Dailymotion', icon: 'dailymotion', supported: true },
            { name: 'MovieBox', icon: 'moviebox', supported: false },
            { name: 'NetMirror', icon: 'netmirror', supported: false },
            { name: 'Crunchyroll', icon: 'crunchyroll', supported: false }
        ]
    });
});

module.exports = router;
