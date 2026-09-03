const express = require('express');
const router = express.Router();
const ytdl = require('ytdl-core');
const fs = require('fs-extra');
const path = require('path');
const contentDisposition = require('content-disposition');
const axios = require('axios');

// Platform detection
function detectPlatform(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
        if (host.includes('tiktok.com')) return 'tiktok';
        if (host.includes('instagram.com')) return 'instagram';
        if (host.includes('facebook.com') || host.includes('fb.com')) return 'facebook';
        if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
        if (host.includes('reddit.com')) return 'reddit';
        if (host.includes('vimeo.com')) return 'vimeo';
        if (host.includes('dailymotion.com')) return 'dailymotion';
        return 'unknown';
    } catch {
        return 'unknown';
    }
}

// Get video info
router.post('/info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ success: false, error: 'URL is required' });

        const platform = detectPlatform(url);

        if (platform === 'youtube') {
            const info = await ytdl.getInfo(url);
            return res.json({
                success: true,
                platform: platform,
                title: info.videoDetails.title,
                duration: parseInt(info.videoDetails.lengthSeconds),
                thumbnail: info.videoDetails.thumbnails?.pop()?.url || '',
                videoId: info.videoDetails.videoId,
                author: info.videoDetails.author.name
            });
        }

        // For other platforms - basic info
        try {
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 10000
            });
            const titleMatch = response.data.match(/<title>(.*?)<\/title>/);
            return res.json({
                success: true,
                platform: platform,
                title: titleMatch ? titleMatch[1].trim() : 'Video',
                thumbnail: null,
                duration: null
            });
        } catch {
            return res.json({
                success: true,
                platform: platform,
                title: 'Video',
                thumbnail: null,
                duration: null
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Download video
router.post('/download', async (req, res) => {
    try {
        const { url, quality = 'best' } = req.body;
        if (!url) return res.status(400).json({ success: false, error: 'URL is required' });

        const platform = detectPlatform(url);

        if (platform === 'youtube') {
            const info = await ytdl.getInfo(url);
            const title = info.videoDetails.title.replace(/[^\w\s-]/gi, '');

            // Choose format
            const format = ytdl.chooseFormat(info.formats, {
                quality: quality === 'best' ? 'highest' : 'lowest',
                filter: 'audioandvideo'
            });

            if (!format) {
                // Fallback: get video only
                const videoFormat = ytdl.chooseFormat(info.formats, {
                    quality: quality === 'best' ? 'highestvideo' : 'lowestvideo'
                });
                if (!videoFormat) throw new Error('No suitable format found');

                const filename = `${title}.mp4`;
                res.setHeader('Content-Type', 'video/mp4');
                res.setHeader('Content-Disposition', contentDisposition(filename));
                res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

                const stream = ytdl(url, { quality: quality === 'best' ? 'highestvideo' : 'lowestvideo' });
                stream.pipe(res);
                return;
            }

            const filename = `${title}.mp4`;
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', contentDisposition(filename));
            res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

            const stream = ytdl(url, {
                quality: quality === 'best' ? 'highest' : 'lowest',
                filter: 'audioandvideo'
            });
            stream.pipe(res);

        } else {
            // For other platforms - proxy download
            try {
                const response = await axios({
                    method: 'GET',
                    url: url,
                    responseType: 'stream',
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });

                const filename = `video_${Date.now()}.mp4`;
                res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
                res.setHeader('Content-Disposition', contentDisposition(filename));
                response.data.pipe(res);

            } catch {
                res.status(400).json({
                    success: false,
                    error: 'Direct download not supported for this platform'
                });
            }
        }

    } catch (error) {
        console.error('Download error:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: error.message });
        }
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
            { name: 'Dailymotion', icon: 'dailymotion', supported: true }
        ]
    });
});

module.exports = router;
