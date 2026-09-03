const express = require('express');
const router = express.Router();
const ytdl = require('ytdl-core');
const contentDisposition = require('content-disposition');

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
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

// ============================================================
// VALIDATE YOUTUBE URL
// ============================================================
function isValidYouTubeUrl(url) {
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        if (host.includes('youtube.com') || host.includes('youtu.be')) {
            const videoId = u.searchParams?.get('v') || u.pathname?.split('/').pop();
            return videoId && videoId.length === 11;
        }
        return false;
    } catch {
        return false;
    }
}

// ============================================================
// GET VIDEO INFO - FIXED
// ============================================================
router.post('/info', async (req, res) => {
    try {
        console.log('📡 Info request received:', req.body);
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL is required'
            });
        }

        // Validate URL
        if (!isValidYouTubeUrl(url)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid YouTube URL. Please check the link.'
            });
        }

        const platform = detectPlatform(url);
        console.log('📍 Platform detected:', platform);

        if (platform === 'youtube') {
            try {
                console.log('⏳ Fetching YouTube info...');
                const info = await ytdl.getInfo(url);
                console.log('✅ YouTube info fetched:', info.videoDetails.title);

                const videoId = info.videoDetails.videoId;
                const thumbnail = getYouTubeThumbnail(videoId);

                return res.json({
                    success: true,
                    platform: platform,
                    title: info.videoDetails.title,
                    duration: parseInt(info.videoDetails.lengthSeconds),
                    thumbnail: thumbnail,
                    videoId: videoId,
                    author: info.videoDetails.author.name
                });
            } catch (error) {
                console.error('❌ YouTube fetch error:', error.message);
                return res.status(400).json({
                    success: false,
                    error: 'Video not found or unavailable. Please check the URL.'
                });
            }
        }

        return res.json({
            success: true,
            platform: platform,
            title: 'Video',
            thumbnail: null,
            duration: null
        });

    } catch (error) {
        console.error('❌ Info error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get video info'
        });
    }
});

// ============================================================
// DOWNLOAD VIDEO - FIXED
// ============================================================
router.post('/download', async (req, res) => {
    try {
        console.log('📡 Download request received:', req.body);
        const { url, quality = 'best' } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL is required'
            });
        }

        // Validate URL
        if (!isValidYouTubeUrl(url)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid YouTube URL'
            });
        }

        const platform = detectPlatform(url);
        console.log('📍 Platform detected:', platform);

        if (platform === 'youtube') {
            try {
                console.log('⏳ Fetching video info...');
                const info = await ytdl.getInfo(url);
                const title = info.videoDetails.title.replace(/[^\w\s-]/gi, '');

                // Choose format
                let format = ytdl.chooseFormat(info.formats, {
                    quality: quality === 'best' ? 'highest' : 'lowest',
                    filter: 'audioandvideo'
                });

                if (!format) {
                    // Try video only
                    format = ytdl.chooseFormat(info.formats, {
                        quality: quality === 'best' ? 'highestvideo' : 'lowestvideo'
                    });
                }

                if (!format) {
                    // Try any format with video
                    format = ytdl.chooseFormat(info.formats, {
                        quality: 'highest',
                        filter: 'videoandaudio'
                    });
                }

                if (!format) {
                    throw new Error('No suitable video format found');
                }

                const filename = `${title}.mp4`;
                console.log('✅ Streaming:', filename);

                // Set headers
                res.setHeader('Content-Type', 'video/mp4');
                res.setHeader('Content-Disposition', contentDisposition(filename));
                res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');
                if (format.contentLength) {
                    res.setHeader('Content-Length', format.contentLength);
                }

                // Stream video
                const stream = ytdl(url, {
                    format: format,
                    quality: quality === 'best' ? 'highest' : 'lowest',
                    filter: 'audioandvideo'
                });

                stream.on('error', (err) => {
                    console.error('❌ Stream error:', err);
                    if (!res.headersSent) {
                        res.status(500).json({
                            success: false,
                            error: err.message
                        });
                    }
                });

                stream.pipe(res);

            } catch (error) {
                console.error('❌ YouTube download error:', error.message);
                res.status(500).json({
                    success: false,
                    error: error.message || 'Failed to download video'
                });
            }
        } else {
            res.status(400).json({
                success: false,
                error: 'Only YouTube is currently supported'
            });
        }

    } catch (error) {
        console.error('❌ Download error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: error.message || 'Download failed'
            });
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
            { name: 'YouTube', supported: true },
            { name: 'TikTok', supported: false },
            { name: 'Instagram', supported: false },
            { name: 'Facebook', supported: false },
            { name: 'Twitter/X', supported: false },
            { name: 'Reddit', supported: false },
            { name: 'Vimeo', supported: false },
            { name: 'Dailymotion', supported: false }
        ]
    });
});

module.exports = router;
