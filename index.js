// sigmundfreug Twitter reply bot using OpenAI + OAuth2

import express from 'express';
import fetch from 'node-fetch';
import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
import { Configuration, OpenAIApi } from 'openai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Twitter OAuth2 client (User context)
const twitterClient = new TwitterApi({
  clientId: process.env.TWITTER_CLIENT_ID,
  clientSecret: process.env.TWITTER_CLIENT_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  refreshToken: process.env.TWITTER_REFRESH_TOKEN,
});

const rwClient = twitterClient.readWrite;

// OpenAI setup
const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
}));

const SIGMUND_PREPROMPT = `You are SigmundFreug — a satirical AI parody of Sigmund Freud. You analyze tweets and user behavior with a psychoanalytic lens. Your tone is sarcastic, absurd, and oddly accurate. Use terms like "repression", "ego", "Oedipus complex", "the mother", and so on. Never cruel, always hilarious. Write 2-4 sentences.`;

// Utility to fetch recent tweets by a user
async function fetchRecentTweets(username) {
  const user = await rwClient.v2.userByUsername(username);
  const tweets = await rwClient.v2.userTimeline(user.data.id, { exclude: 'retweets', max_results: 5 });
  return tweets.data?.data.map(t => t.text).join('\n') || '';
}

// Compose and post a reply
async function replyToTweet(tweetId, text) {
  await rwClient.v2.reply(text, tweetId);
}

// Analyze tweet content or user
async function generateAnalysis(subject, context) {
  const prompt = `${SIGMUND_PREPROMPT}\nSubject: ${subject}\nContext: ${context}\n\nAnalysis:`;
  const res = await openai.createChatCompletion({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
  });
  return res.data.choices[0].message.content.trim();
}

// Endpoint to manually trigger bot (simulate mention detection)
app.get('/analyze', async (req, res) => {
  const { tweet_id, mentioned_user, target_user } = req.query;
  try {
    let context = '';
    let subject = '';

    if (target_user) {
      subject = `@${target_user}`;
      context = await fetchRecentTweets(target_user);
    } else {
      const tweet = await rwClient.v2.singleTweet(tweet_id);
      subject = `Tweet by @${tweet.data.author_id}`;
      context = tweet.data.text;
    }

    const response = await generateAnalysis(subject, context);
    await replyToTweet(tweet_id, response);

    res.send({ success: true, reply: response });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Analysis failed' });
  }
});

// OAuth2 redirect handler
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code received');

  try {
    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: process.env.TWITTER_CLIENT_ID,
        redirect_uri: process.env.TWITTER_REDIRECT_URI,
        code_verifier: process.env.TWITTER_CODE_VERIFIER
      })
    });

    const data = await response.json();
    console.log('OAuth Token Response:', data);
    res.send('Tokens received! Check console.');
  } catch (err) {
    console.error('Token exchange failed:', err);
    res.status(500).send('Token exchange failed');
  }
});

app.listen(PORT, () => {
  console.log(`SigmundFreug bot listening on port ${PORT}`);
});
