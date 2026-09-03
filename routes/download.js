const express = require('express');
const router = express.Router();
const ytdl = require('ytdl-core');
const contentDisposition = require('content-disposition');
const axios = require('axios');

// ============================================================
// PLATFORM DETECTION
// ============================================================
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

// ============================================================
// GET YOUTUBE THUMBNAIL
// ============================================================
function getYouTubeThumbnail(videoId) {
    const qualities = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default'];
    for (const quality of qualities) {
        const url = `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
        // Return the highest quality available
        if (quality === 'maxresdefault') return url;
    }
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

// ============================================================
// GET VIDEO INFO
// ============================================================
router.post('/info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ success: false, error: 'URL is required' });
        }

        const platform = detectPlatform(url);

        if (platform === 'youtube') {
            try {
                const info = await ytdl.getInfo(url);
                const videoId = info.videoDetails.videoId;
                const thumbnail = getYouTubeThumbnail(videoId);

                return res.json({
                    success: true,
                    platform: platform,
                    title: info.videoDetails.title,
                    duration: parseInt(info.videoDetails.lengthSeconds),
                    thumbnail: thumbnail,
                    videoId: videoId,
                    author: info.videoDetails.author.name,
                    formats: info.formats.map(f => ({
                        itag: f.itag,
                        quality: f.qualityLabel || f.quality,
                        hasVideo: f.hasVideo,
                        hasAudio: f.hasAudio,
                        bitrate: f.bitrate,
                        container: f.container
                    }))
                });
            } catch (error) {
                console.error('YouTube info error:', error);
                return res.status(400).json({
                    success: false,
                    error: 'Invalid YouTube URL or video unavailable'
                });
            }
        }

        // For other platforms
        return res.json({
            success: true,
            platform: platform,
            title: 'Video',
            thumbnail: null,
            duration: null
        });

    } catch (error) {
        console.error('Info error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// DOWNLOAD VIDEO (STREAMING)
// ============================================================
router.post('/download', async (req, res) => {
    try {
        const { url, quality = 'best' } = req.body;
        if (!url) {
            return res.status(400).json({ success: false, error: 'URL is required' });
        }

        const platform = detectPlatform(url);

        if (platform === 'youtube') {
            try {
                const info = await ytdl.getInfo(url);
                const title = info.videoDetails.title.replace(/[^\w\s-]/gi, '');

                // Select format based on quality
                let format;
                if (quality === 'best') {
                    // Try to get 1080p or highest with audio
                    format = ytdl.chooseFormat(info.formats, {
                        quality: ['137', '136', '135', '134', '133', '22', '18'],
                        filter: 'audioandvideo'
                    });
                    
                    // If no combined format, get video + audio separately
                    if (!format) {
                        format = ytdl.chooseFormat(info.formats, {
                            quality: 'highestvideo'
                        });
                    }
                } else {
                    format = ytdl.chooseFormat(info.formats, {
                        quality: 'lowest',
                        filter: 'audioandvideo'
                    });
                }

                if (!format) {
                    // Fallback to any format with video
                    format = ytdl.chooseFormat(info.formats, {
                        quality: 'highest',
                        filter: 'videoandaudio'
                    });
                }

                if (!format) {
                    throw new Error('No suitable video format found');
                }

                const filename = `${title}.mp4`;
                res.setHeader('Content-Type', 'video/mp4');
                res.setHeader('Content-Disposition', contentDisposition(filename));
                res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');
                res.setHeader('Content-Length', format.contentLength || 0);

                // Stream video
                const stream = ytdl(url, {
                    format: format,
                    quality: quality === 'best' ? 'highest' : 'lowest',
                    filter: 'audioandvideo'
                });

                stream.on('error', (err) => {
                    console.error('Stream error:', err);
                    if (!res.headersSent) {
                        res.status(500).json({ success: false, error: err.message });
                    }
                });

                stream.pipe(res);

            } catch (error) {
                console.error('YouTube download error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message || 'Failed to download YouTube video'
                });
            }
        } else {
            // For other platforms - proxy download
            try {
                const response = await axios({
                    method: 'GET',
                    url: url,
                    responseType: 'stream',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'video/*'
                    },
                    timeout: 30000
                });

                const filename = `video_${Date.now()}.mp4`;
                res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
                res.setHeader('Content-Disposition', contentDisposition(filename));
                res.setHeader('Content-Length', response.headers['content-length'] || 0);

                response.data.pipe(res);

            } catch (error) {
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

// ============================================================
// GET PLATFORMS
// ============================================================
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
