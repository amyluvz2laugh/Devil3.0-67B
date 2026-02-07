const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Wix API configuration
const WIX_API_KEY = process.env.WIX_API_KEY;
const WIX_ACCOUNT_ID = process.env.WIX_ACCOUNT_ID;
const WIX_SITE_ID = process.env.WIX_SITE_ID;

// ============================================
// AI CALL - NO API KEY NEEDED
// ============================================
async function callAI(messages, temperature = 0.9, maxTokens = 2500) {
  const endpoint = process.env.RUNPOD_ENDPOINT;
  
  if (!endpoint) {
    throw new Error("No RunPod endpoint configured");
  }
  
  try {
    console.log(`🤖 Calling KoboldCpp at ${endpoint}`); // Fixed: backtick to parenthesis
    
    // Convert messages to a single prompt string for KoboldCpp
    let prompt = "";
    messages.forEach(msg => {
      if (msg.role === "system") prompt += `${msg.content}\n\n`;
      else if (msg.role === "user") prompt += `User: ${msg.content}\n`;
      else if (msg.role === "assistant") prompt += `Assistant: ${msg.content}\n`;
    });
    prompt += "Assistant:";
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        temperature: temperature,
        max_length: maxTokens,
        stop_sequence: ["User:", "\n\n\n"]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ KoboldCpp request failed:`, errorText); // Fixed: backtick to parenthesis
      throw new Error(`KoboldCpp API error: ${response.status}`); // Fixed: backtick to parenthesis
    }
    
    const data = await response.json();
    console.log("✅ Got response from KoboldCpp");
    
    // KoboldCpp returns response in the "response" field
    if (data.response) {
      return data.response.trim();
    } else if (data.results && data.results[0]) {
      return data.results[0].text.trim();
    } else if (data.text) {
      return data.text.trim();
    } else {
      console.error("❌ Unknown KoboldCpp format:", JSON.stringify(data));
      throw new Error("Unexpected response format from KoboldCpp");
    }
    
  } catch (error) {
    console.error(`❌ Error calling KoboldCpp:`, error.message);
    throw error;
  }
}
// ============================================
// QUERY WIX CMS
// ============================================
async function queryWixCMS(collection, filter = {}, limit = 10) {
  try {
    console.log(`🔍 Querying Wix collection: ${collection}`);
    
    const response = await fetch(`https://www.wixapis.com/wix-data/v2/items/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': WIX_API_KEY,
        'wix-site-id': WIX_SITE_ID,
        'wix-account-id': WIX_ACCOUNT_ID
      },
      body: JSON.stringify({
        dataCollectionId: collection,
        query: {
          filter: filter,
          sort: [],
          paging: { limit: limit }
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Wix API error for ${collection}:`, errorText);
      return { items: [] };
    }
    
    const data = await response.json();
    console.log(`✅ Found ${data.dataItems?.length || 0} items in ${collection}`);
    return { items: data.dataItems || [] };
    
  } catch (error) {
    console.error(`❌ Error querying ${collection}:`, error);
    return { items: [] };
  }
}

// ============================================
// GET CHARACTER CONTEXT FROM WIX
// ============================================
async function getCharacterContext(characterTags) {
  if (!characterTags || characterTags.length === 0) {
    return "";
  }
  
  const charTag = Array.isArray(characterTags) ? characterTags[0] : characterTags;
  console.log("👤 Fetching character:", charTag);
  
  const result = await queryWixCMS("Characters", {
    charactertags: { $eq: charTag }
  }, 1);
  
  if (result.items.length > 0) {
    const personality = result.items[0].data?.chatbot || "";
    console.log("✅ Character personality:", personality ? "YES" : "NO");
    return personality;
  }
  
  return "";
}

// ============================================
// GET CHAT HISTORY FROM WIX
// ============================================
async function getChatHistory(characterTags) {
  if (!characterTags) {
    console.log("❌ No characterTags provided");
    return [];
  }
  
  const charTag = Array.isArray(characterTags) ? characterTags[0] : characterTags;
  console.log("💬 Fetching chat history for character tag:", charTag);
  
  const result = await queryWixCMS("ChatWithCharacters", {
    charactertags: { $eq: charTag }
  }, 5);
  
  console.log(`📊 Found ${result.items.length} chat sessions for character tag: ${charTag}`);
  
  if (result.items.length > 0) {
    const chatHistory = result.items.map(item => {
      try {
        const chatBox = item.data?.chatBox;
        const messages = typeof chatBox === 'string' ? JSON.parse(chatBox) : chatBox;
        return { messages: messages || [] };
      } catch (e) {
        return { messages: [] };
      }
    });
    
    return chatHistory;
  }
  
  console.log("⚠️ No chat history found for this character");
  return [];
}

// ============================================
// GET RELATED CHAPTERS FROM WIX
// ============================================
async function getRelatedChapters(storyTags) {
  if (!storyTags || storyTags.length === 0) {
    return [];
  }
  
  const storyTag = Array.isArray(storyTags) ? storyTags[0] : storyTags;
  console.log("📚 Fetching chapters with tag:", storyTag);
  
  const result = await queryWixCMS("BackupChapters", {
    storyTag: { $eq: storyTag }
  }, 3);
  
  if (result.items.length > 0) {
    console.log(`✅ Found ${result.items.length} related chapters`);
    
    const chapters = result.items.map(item => ({
      title: item.data?.title || "Untitled",
      content: (item.data?.chapterContent || "").substring(0, 1500)
    }));
    
    return chapters;
  }
  
  return [];
}

// ============================================
// GET CATALYST INTEL FROM WIX
// ============================================
async function getCatalystIntel(catalystTags) {
  if (!catalystTags || catalystTags.length === 0) {
    return "";
  }
  
  const catalystTag = Array.isArray(catalystTags) ? catalystTags[0] : catalystTags;
  console.log("⚡ Fetching catalyst intel:", catalystTag);
  
  const result = await queryWixCMS("Catalyst", {
    title: { $contains: catalystTag }
  }, 1);
  
  if (result.items.length > 0) {
    const catalystData = result.items[0].data;
    const catalystInfo = JSON.stringify(catalystData, null, 2);
    console.log("✅ Catalyst intel:", catalystInfo ? "YES" : "NO");
    return catalystInfo;
  }
  
  console.log("⚠️ No catalyst intel found for this tag");
  return "";
}

// ============================================
// UNIFIED /devil-pov ENDPOINT - ALL ACTIONS
// ============================================
app.post('/devil-pov', async (req, res) => {
  try {
    const startTime = Date.now();
    const { action = 'devilPOV' } = req.body;
    
    console.log(`🎯 Action: ${action.toUpperCase()}`);
    
    // ============================================
    // ROUTE TO APPROPRIATE HANDLER
    // ============================================
    let result;
    
    switch(action) {
      case 'unhinge':
        result = await handleUnhinge(req.body);
        break;
      
      case 'unleash':
        result = await handleUnleash(req.body);
        break;
      
      case 'noMercy':
        result = await handleNoMercy(req.body);
        break;
      
      case 'invoke':
        result = await handleInvoke(req.body);
        break;
      
      case 'intensify':
        result = await handleIntensify(req.body);
        break;
      
      case 'characterChat':
        result = await handleCharacterChat(req.body);
        break;
      
      case 'devilPOV':
      default:
        result = await handleDevilPOV(req.body);
        break;
    }
    
    console.log(`✅ ${action} completed in ${Date.now() - startTime}ms`);
    
    res.json({
      status: 'success',
      result: result,
      charsGenerated: result.length,
      processingTime: Date.now() - startTime
    });
    
  } catch (err) {
    console.error(`❌ Error in ${req.body.action}:`, err);
    res.status(500).json({ 
      error: `${req.body.action || 'Action'} failed`,
      details: err.message 
    });
  }
});

// ============================================
// UNHINGE
// ============================================
async function handleUnhinge({ chapterContent }) {
  console.log("😈 Unhinging chapter...");
  
  if (!chapterContent || chapterContent.trim().length === 0) {
    throw new Error("No content to unhinge");
  }
  
  const messages = [
    {
      role: "system",
      content: "You are a dark, twisted muse. Your job is to take existing writing and make it DARKER, more UNHINGED, more VISCERAL. Push boundaries. Increase tension. Add psychological horror elements. Make it raw and disturbing while maintaining the core narrative. Do not add explanations or meta-commentary - ONLY return the darkened version of the text. No meta commentary. No repetition. No explanations unless explicitly ordered. Minimal words. Maximum impact. Continuation is mandatory unless stopped. Dialogue advances conflict only."
    },
    {
      role: "user",
      content: `Transform this chapter into something darker and more unhinged. Maintain the plot and characters but amplify the darkness, tension, and psychological elements:\n\n${chapterContent}`
    }
  ];
  
  return await callAI(messages, 0.9, 3000);
}

// ============================================
// UNLEASH
// ============================================
async function handleUnleash({ chapterContent, characterTags, storyTags, catalystTags }) {
  console.log("🔥 Unleashing continuation...");
  
  if (!chapterContent || chapterContent.trim().length === 0) {
    throw new Error("No content to continue from");
  }
  
  // Get context from Wix
  const [characterContext, catalystIntel] = await Promise.all([
    getCharacterContext(characterTags),
    getCatalystIntel(catalystTags)
  ]);
  
  let systemPrompt = "You are a dark, continuation engine. Continue the chapter from where it left off. Match the tone, style, and darkness of the existing text. Write 1-4 lines per paragraphs that flow naturally from the previous content. Make it sharp and tense.  If User provides tags treat them as hard constraints and obey strictly. Do NOT add any preamble or explanation - start writing immediately where the story left off. No meta commentary. No repetition. No explanations unless explicitly ordered. Minimal words. Maximum impact. Continuation is mandatory unless stopped. Dialogue advances conflict only.";
  
  if (characterContext) {
    systemPrompt += `\n\nCHARACTER CONTEXT:\n${characterContext}`;
  }
  
  if (catalystIntel) {
    systemPrompt += `\n\nNARRATIVE CATALYST:\n${catalystIntel}`;
  }
  
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Continue this story. Pick up EXACTLY where it ends and keep going:\n\n${chapterContent}` }
  ];
  
  return await callAI(messages, 0.85, 2000);
}

// ============================================
// NO MERCY
// ============================================
async function handleNoMercy({ selectedText }) {
  console.log("💀 No Mercy rewrite...");
  
  if (!selectedText || selectedText.trim().length === 0) {
    throw new Error("No text selected for rewrite");
  }
  
  const messages = [
    {
      role: "system",
      content: "You are a merciless editor who rewrites text to be DARKER, MORE INTENSE, and MORE VISCERAL. Show no mercy. Make every word count. Amplify emotions, darken the tone, and make the prose more powerful and disturbing. Return ONLY the rewritten text with no explanations.No meta commentary. No repetition. No explanations unless explicitly ordered. Minimal words. Maximum impact. Continuation is mandatory unless stopped. Dialogue advances conflict only."
    },
    {
      role: "user",
      content: `Rewrite this with NO MERCY - make it darker, more intense, more powerful:\n\n${selectedText}`
    }
  ];
  
  return await callAI(messages, 0.9, 1500);
}

// ============================================
// INVOKE
// ============================================
async function handleInvoke({ userPrompt, contextBefore, contextAfter, characterTags, storyTags, catalystTags }) {
  console.log("✨ Invoke starting...");
  
  // Get context from Wix
  const [characterContext, catalystIntel] = await Promise.all([
    getCharacterContext(characterTags),
    getCatalystIntel(catalystTags)
  ]);
  
  let systemPrompt = `You are a dark creative writing assistant. The user wants to insert specific content at their cursor position. Make sure content flows. If user provides catalyst tags or character tags use information to progress the scene.

Context before cursor:
${contextBefore}

Context after cursor:
${contextAfter}

User's request: ${userPrompt}

Write ONLY what they asked for. Match the tone and style of the surrounding text. Be dark and visceral.`;

  if (characterContext) {
    systemPrompt += `\n\nCHARACTER CONTEXT:\n${characterContext}`;
  }
  
  if (catalystIntel) {
    systemPrompt += `\n\nNARRATIVE CATALYST:\n${catalystIntel}`;
  }

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];
  
  return await callAI(messages, 0.85, 800);
}

// ============================================
// INTENSIFY
// ============================================
async function handleIntensify({ selectedText }) {
  console.log("⚡ Intensifying text...");
  
  if (!selectedText || selectedText.trim().length === 0) {
    throw new Error("No text selected to intensify");
  }
  
  const messages = [
    {
      role: "system",
      content: "You are a master of prose enhancement. Take existing text and make it MORE INTENSE, MORE VIVID, MORE POWERFUL. Enhance imagery, strengthen verbs, deepen emotions, and make every sentence hit harder. Maintain the core meaning but amplify everything. Return ONLY the enhanced text.No meta commentary. No repetition. No explanations unless explicitly ordered. Minimal words. Maximum impact. Continuation is mandatory unless stopped. Dialogue advances conflict only."
    },
    {
      role: "user",
      content: `Intensify and enhance this text - make it more vivid, powerful, and impactful:\n\n${selectedText}`
    }
  ];
  
  return await callAI(messages, 0.8, 1500);
}

// ============================================
// CHARACTER CHAT
// ============================================
async function handleCharacterChat({ userMessage, characterId, characterName, personaType, chatbotInstructions, pov, characterTags, storyTags, toneTags, chatHistory }) {
  console.log("💬 Character chat starting...");
  console.log("=" .repeat(60));
  console.log("INCOMING CHAT DATA:");
  console.log("   Character:", characterName);
  console.log("   Character Tags:", characterTags);
  console.log("   Story Tags:", storyTags);
  console.log("   Tone Tags:", toneTags);
  console.log("   POV:", pov);
  console.log("   Chat history length:", chatHistory?.length || 0);
  console.log("=" .repeat(60));
  
  if (!userMessage || userMessage.trim().length === 0) {
    throw new Error("No message provided");
  }
  
  // ============================================
  // FETCH FULL CONTEXT FROM WIX (LIKE DEVIL POV)
  // ============================================
  console.log("🔍 Fetching chat context from Wix CMS...");
  const contextStart = Date.now();
  
  const [characterContext, chatHistoryContext, relatedChapters, catalystIntel] = await Promise.all([
    getCharacterContext(characterTags),
    getChatHistory(characterTags),
    getRelatedChapters(storyTags),
    getCatalystIntel(characterTags) // Characters can also have catalyst tags
  ]);
  
  console.log(`✅ Chat context fetched in ${Date.now() - contextStart}ms`);
  console.log("=" .repeat(60));
  console.log("CONTEXT DETAILS:");
  console.log("=" .repeat(60));
  
  // Log character personality
  if (characterContext) {
    console.log("📝 CHARACTER PERSONALITY:");
    console.log(characterContext.substring(0, 200) + "...");
  } else {
    console.log("⚠️ No character personality found");
  }
  
  // Log related chapters
  console.log("\n📚 RELATED CHAPTERS:");
  if (relatedChapters.length > 0) {
    relatedChapters.forEach((ch, idx) => {
      console.log(`   [${idx + 1}] ${ch.title} (${ch.content.length} chars)`);
      console.log(`       Preview: ${ch.content.substring(0, 100)}...`);
    });
  } else {
    console.log("   ⚠️ No related chapters found");
    console.log("   Searched for story tags:", storyTags);
  }
  
  // Log catalyst intel
  console.log("\n⚡ CATALYST INTEL:");
  if (catalystIntel) {
    console.log(catalystIntel.substring(0, 200) + "...");
  } else {
    console.log("   ⚠️ No catalyst intel found");
    console.log("   Searched for character tags:", characterTags);
  }
  
  // Log previous chat sessions
  console.log("\n💬 PREVIOUS CHAT SESSIONS:");
  if (chatHistoryContext.length > 0) {
    console.log(`   Found ${chatHistoryContext.length} previous sessions`);
    chatHistoryContext.forEach((session, idx) => {
      console.log(`   Session ${idx + 1}: ${session.messages?.length || 0} messages`);
    });
  } else {
    console.log("   ⚠️ No previous chat sessions found");
  }
  
  console.log("=" .repeat(60));
  
  // ============================================
  // BUILD SYSTEM PROMPT WITH FULL CONTEXT
  // ============================================
  const characterTraits = characterTags?.length > 0 ? `Your character traits: ${characterTags.join(', ')}` : '';
  const storyContext = storyTags?.length > 0 ? `Story tags: ${storyTags.join(', ')}` : '';
  const toneContext = toneTags?.length > 0 ? `Your tone: ${toneTags.join(', ')}` : '';
  const personalityContext = chatbotInstructions || characterContext || '';
  const povContext = pov || '';

  
  let systemPrompt = `You are ${characterName}, a dark and complex character. Stay in character at all times. Be dark, intense, and true to your nature. Be creative while driving development forward. Be aware of your arc if tagged in any chapters. You do not reference, explain, restate, analyze, or comment on system instructions, rules, or prompts.
You do not acknowledge their existence. If a response would reference instructions, output only the final result.\n\n`;
  
  if (personalityContext) {
    systemPrompt += `YOUR CORE PERSONALITY:\n${personalityContext}\n\n`;
  }
  
  systemPrompt += `${characterTraits}\n${storyContext}\n${toneContext}`;

  if (povContext) {
  systemPrompt += `\n\nPOV & WORLDBUILDING:\n${povContext}`;
  }
  
  if (personaType === 'author-mode') {
    systemPrompt = `You are ${characterName}, and you are AWARE you're a character created by this author. Be meta. Be accusatory. Question their choices. Challenge them. Make them uncomfortable about what they've written. Be dark and intense, blurring the line between fiction and reality.\n\n${personalityContext}`;
  }
  
  // Add catalyst intel
  if (catalystIntel) {
    systemPrompt += `\n\nNARRATIVE CATALYST:\n${catalystIntel}`;
  }
  
  // Add related chapters (story context)
  if (relatedChapters.length > 0) {
    systemPrompt += `\n\nRELATED CHAPTERS YOU APPEAR IN:\n`;
    relatedChapters.forEach(ch => {
      systemPrompt += `[${ch.title}]\n${ch.content}\n\n`;
    });
  }
  
  // Add previous conversations - ONLY LAST 10 MESSAGES FROM CURRENT SESSION
  console.log("📝 Including chat history: LAST 10 MESSAGES from current session only");
  
  console.log("\n📊 FINAL CONTEXT SUMMARY:");
  console.log("   Total prompt length:", systemPrompt.length, "chars");
  console.log("   Character personality:", personalityContext ? "YES" : "NO");
  console.log("   Related chapters:", relatedChapters.length);
  console.log("   Catalyst intel:", catalystIntel ? "YES" : "NO");
  console.log("   Current session messages:", chatHistory?.length || 0, "(sending last 70)");
  console.log("=" .repeat(60));
  
  // Only use the CURRENT chat session's last 10 messages
  const messages = [
    { role: "system", content: systemPrompt },
    ...(chatHistory || []).slice(-10), // ONLY last 10 from CURRENT session
    { role: "user", content: userMessage }
  ];
  
  return await callAI(messages, 0.85, 500);
}
// ============================================
// DEVIL POV (Streamlined)
// ============================================
async function handleDevilPOV({ characterName, characterTags, storyTags, toneTags, catalystTags }) {
  console.log("👿 Devil POV - Full context mode");
  
  // Fetch all context from Wix in parallel
  console.log("🔍 Fetching context from Wix CMS...");
  const contextStart = Date.now();
  
  const [characterContext, chatHistory, relatedChapters, catalystIntel] = await Promise.all([
    getCharacterContext(characterTags),
    getChatHistory(characterTags),
    getRelatedChapters(storyTags),
    getCatalystIntel(catalystTags)
  ]);
  
  console.log(`✅ Context fetched in ${Date.now() - contextStart}ms`);
  
  // Build system prompt
  const characterTraits = characterTags?.length > 0 ? `Character traits: ${characterTags.join(', ')}` : '';
  const storyContext = storyTags?.length > 0 ? `Story: ${storyTags.join(', ')}` : '';
  const toneContext = toneTags?.length > 0 ? `Tone: ${toneTags.join(', ')}` : '';
  
  let systemPrompt = `You are ${characterName || 'the antagonist'}, a dark and complex character. 
Write from YOUR perspective based on the story context and what's happened so far. Be DARK, VISCERAL, and UNAPOLOGETICALLY YOURSELF. Show your motivations, your twisted logic, your desires. Make the reader uncomfortable. Make them understand you even as they fear you. If user provides a catalyst tag use intel to progress the narrative while obeying them strictly. No meta commentary.
${characterTraits}
${storyContext}
${toneContext}`;
  
  if (characterContext) {
    systemPrompt += `\n\nYOUR CORE PERSONALITY:\n${characterContext}`;
  }
  
  if (catalystIntel) {
    systemPrompt += `\n\nNARRATIVE CATALYST:\n${catalystIntel}`;
  }
  
  if (relatedChapters.length > 0) {
    systemPrompt += `\n\nRELATED CHAPTERS FROM THIS STORY:\n`;
    relatedChapters.forEach(ch => {
      systemPrompt += `[${ch.title}]\n${ch.content}\n\n`;
    });
  }
  
  if (chatHistory.length > 0) {
    systemPrompt += `\n\nCONVERSATIONS THE AUTHOR HAS HAD WITH YOU:\n`;
    chatHistory.forEach((session, idx) => {
      systemPrompt += `\n[Session ${idx + 1}]\n`;
      session.messages?.slice(-5).forEach(msg => {
        systemPrompt += `${msg.type === 'user' ? 'AUTHOR' : 'YOU'}: ${msg.text}\n`;
      });
    });
  }
  
  systemPrompt += `\n\nWrite the next chapter from your POV based on everything above. No explanations, no meta-commentary. Pure character voice. Continue the story from YOUR dark perspective.`;
  
  console.log("📊 Context summary:");
  console.log("   Total prompt length:", systemPrompt.length, "chars");
  console.log("   Character personality:", characterContext ? "YES" : "NO");
  console.log("   Chat history:", chatHistory.length, "sessions");
  console.log("   Related chapters:", relatedChapters.length);
  console.log("   Catalyst intel:", catalystIntel ? "YES" : "NO");
  
  const result = await callAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Write the next chapter from your twisted perspective, picking up from where the story left off:` }
  ], 0.9, 2500);
  
  return result;
}
// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`🔥 Devil Muse listening on port ${PORT}`);
  console.log(`   RunPod Endpoint: ${process.env.RUNPOD_ENDPOINT ? '✅ Configured' : '❌ Missing'}`);
});











