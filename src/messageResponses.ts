import { Message } from "discord.js"

const messageResponses = [
  { pattern: "(\\W|\\s+|^)[bruh]{4,}(\\W|\\s+|$)", serverIDBlacklist: ["777244230154059846"], responses: ["bruh"] },
  { pattern: "i hope u choke", responses: ["kinky"] }
]

export function sendMessageResponses(msg: Message)
{
  var messageContent = msg.content.toLowerCase()

  for (let response of messageResponses)
  {
    if (response.serverIDBlacklist && response.serverIDBlacklist.includes(msg.guildId)) { continue } // a necessary sacrifice

    let pattern = response.pattern
    let regex = new RegExp(pattern)
    if (regex.test(messageContent))
    {
      let index = Math.floor((Math.random() * response.responses.length))
      msg.channel.send(response.responses[index])
      return true
    }
  }

  return false
}
