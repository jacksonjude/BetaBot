const messageResponses = [
  { pattern: "(\\W|\\s+|^)[bruh]{4,}(\\W|\\s+|$)", responses: ["bruh"] },
  { pattern: "i hope u choke", responses: ["kinky"] }
]

export const sendMessageResponses = function(msg)
{
  var messageContent = msg.content.toLowerCase()

  for (let responseNum in messageResponses)
  {
    var pattern = messageResponses[responseNum].pattern
    var regex = new RegExp(pattern)
    if (regex.test(messageContent))
    {
      var index = Math.floor((Math.random() * messageResponses[responseNum].responses.length))
      if (msg.author.bot)
      {
        msg.channel.send("https://cdn.discordapp.com/emojis/823952129394868334.png?size=240")
      }
      else
      {
        msg.channel.send(messageResponses[responseNum].responses[index])
      }
      return true
    }
  }

  return false
}
