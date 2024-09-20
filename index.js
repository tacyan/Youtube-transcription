const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = 3000;

// ミドルウェア設定
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('public'));

// ルートパス - フォームを表示
app.get('/', (req, res) => {
    res.render('index', { transcript: '', error: '' });
});

// フォーム送信後の処理
app.post('/transcript', async (req, res) => {
    const youtubeURL = req.body.youtubeURL;
    const videoId = extractVideoID(youtubeURL);

    if (!videoId) {
        return res.render('index', { transcript: '', error: '有効なYouTube URLを入力してください。' });
    }

    try {
        const transcript = await fetchTranscript(videoId);
        if (transcript) {
            res.render('index', { transcript: transcript, error: '' });
        } else {
            res.render('index', { transcript: '', error: '文字起こしが見つかりませんでした。' });
        }
    } catch (error) {
        console.error(error);
        res.render('index', { transcript: '', error: '文字起こしの取得に失敗しました。動画に文字起こしが存在しない可能性があります。' });
    }
});

// YouTube URLから動画IDを抽出する関数
function extractVideoID(url) {
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^\s&]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// 字幕（キャプション）を取得する関数
async function fetchTranscript(videoId) {
    // YouTubeの動画ページURL
    const videoURL = `https://www.youtube.com/watch?v=${videoId}`;

    try {
        // 動画ページを取得
        const response = await axios.get(videoURL);
        const html = response.data;

        // cheerioを使用してHTMLをロード
        const $ = cheerio.load(html);

        // ytInitialPlayerResponseを含むスクリプトタグを探す
        let initialPlayerResponse = null;
        $('script').each((i, elem) => {
            const scriptContent = $(elem).html();
            if (scriptContent && scriptContent.includes('ytInitialPlayerResponse')) {
                const jsonString = scriptContent.match(/ytInitialPlayerResponse\s*=\s*({.*?});/);
                if (jsonString && jsonString[1]) {
                    initialPlayerResponse = JSON.parse(jsonString[1]);
                }
            }
        });

        if (!initialPlayerResponse) {
            console.error('ytInitialPlayerResponse not found');
            return null;
        }

        // 字幕情報を取得
        const captions = initialPlayerResponse.captions;
        if (!captions) {
            console.error('Captions not available');
            return null;
        }

        // 字幕トラックリストを取得
        const captionTracks = captions.playerCaptionsTracklistRenderer.captionTracks;
        if (!captionTracks || captionTracks.length === 0) {
            console.error('No caption tracks found');
            return null;
        }

        // 希望する言語の字幕トラックを選択（例: 日本語 'ja'）
        const desiredLang = 'ja'; // 必要に応じて変更
        let selectedTrack = captionTracks.find(track => track.languageCode === desiredLang);

        // 希望する言語の字幕がない場合、最初の字幕トラックを選択
        if (!selectedTrack) {
            console.warn(`Desired language (${desiredLang}) not found. Using default language.`);
            selectedTrack = captionTracks[0];
        }

        // 字幕XMLを取得
        const captionsURL = selectedTrack.baseUrl;
        const captionsResponse = await axios.get(captionsURL);
        const captionsXML = captionsResponse.data;

        if (!captionsXML) {
            console.error('No captions XML found');
            return null;
        }

        // cheerioを使用してXMLを解析
        const $$ = cheerio.load(captionsXML, { xmlMode: true });
        let transcript = '';

        $$('text').each((i, elem) => {
            const text = $$(elem).text();
            transcript += text + ' ';
        });

        return transcript.trim();
    } catch (error) {
        console.error('Error fetching transcript:', error.message);
        return null;
    }
}

// サーバー起動
app.listen(PORT, () => {
    console.log(`サーバーがポート ${PORT} で起動しました。 http://localhost:${PORT}`);
});
