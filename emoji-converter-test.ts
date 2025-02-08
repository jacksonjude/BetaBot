import emojiConverter from './src/lib/discord-emoji-converter'
import { GuildEmoji, ReactionEmoji, EmojiResolvable } from 'discord.js'

const overrideEmoteNameToEmojiMap = {
	":white_heart:": "🤍",
	":map:": "🗺️",
	":regional_indicator_i:": "🇮",
	":pen_ballpoint:": "🖊"
}
const overrideEmojiToEmoteNameMap = {
	"🤍": ":white_heart:",
	"🗺️": ":map:",
	"🇮": ":regional_indicator_i:",
	"🖊": ":pen_ballpoint:"
}

function getEmoteString(emoji: EmojiResolvable): string
{
	if (emoji instanceof GuildEmoji)
	{
  	return `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`
	}
	
	let emojiString = emoji instanceof ReactionEmoji ? emoji.toString() : emoji as string
	
	if (emojiString.startsWith("<"))
	{
  	return emojiString
	}
	
	if (overrideEmojiToEmoteNameMap[emojiString])
	{
  	return overrideEmojiToEmoteNameMap[emojiString]
	}
	
	try
	{
  	return emojiConverter.getShortcode(emojiString)
	}
	catch (error)
	{}
	
	try
	{
		return emojiConverter.getShortcode(emojiString, true, true)
	}
	catch (error)
	{
		console.log(`[Emote] Emoji converter error while decoding ${emoji}: ${error}`)
	}
}

// console.log(getEmoteString('🗑'))
// console.log(getEmoteString('🗑️'))
// console.log('🗑'.length, '🗑️'.length)
// console.log('🗑' == '🗑️')
// console.log('🗑'.normalize('NFKD').replace(/[\uFE0F\u20E3]/g, '').length, '🗑️'.normalize('NFKD').replace(/[\uFE0F\u20E3]/g, '').length)
// console.log('🗑'.normalize('NFKD').replace(/[\uFE0F\u20E3]/g, '') == '🗑️'.normalize('NFKD').replace(/[\uFE0F\u20E3]/g, ''))
// console.log('🗑'.slice(0, 1).length, '🗑️'.slice(0, 1).length)
// console.log('🗑'.slice(0, 1) == '🗑️'.slice(0, 1))

console.log(getEmoteString('🗑️'))
console.log(getEmoteString('🗑'))
console.log(getEmoteString('🇺🇸'))

console.log('🗑️'.normalize('NFKD').replace(/[\uFE0F\u20E3]/g, '') == '🗑'.normalize('NFKD').replace(/[\uFE0F\u20E3]/g, ''))