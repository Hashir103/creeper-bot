const YouTubeSearchApi = require('youtube-search-api');

async function searchYouTube(query) {
    const results = await YouTubeSearchApi.GetListByKeyword(query, false, 5);
    return results.items.map(item => ({
        title: item.title,
        url: `https://www.youtube.com/watch?v=${item.id}`
    }));
}

module.exports = { searchYouTube };
