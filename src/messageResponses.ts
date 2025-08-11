import { Message, TextChannel } from "discord.js"

const messageResponses = [
  { pattern: "(\\W|\\s+|^)[bruh]{4,}(\\W|\\s+|$)", serverIDBlacklist: ["777244230154059846"], responses: ["bruh"] },
  { pattern: "i hope u choke", responses: ["kinky"] },
  { pattern: "(\\W|\\s+|^)lol\\.(\\W|\\s+|$)", responses: ["lol."] }
]

export function sendMessageResponses(msg: Message)
{
  var messageContent = msg.content.toLowerCase()

  for (let response of messageResponses)
  {
    if (response.serverIDBlacklist && response.serverIDBlacklist.includes(msg.guildId)) { continue } // a necessary sacrifice

    let pattern = response.pattern
    let regex = new RegExp(pattern, "i")
    if (regex.test(messageContent))
    {
      let index = Math.floor((Math.random() * response.responses.length));
      (msg.channel as TextChannel).send(response.responses[index])
      return true
    }
  }

  return false
}
