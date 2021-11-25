const messageResponses = [
  { pattern: "(\\W|\\s+|^)[bruh]{4,}(\\W|\\s+|$)", responses: ["bruh"] }
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
      msg.channel.send(messageResponses[responseNum].responses[index])
      return true
    }
  }

  return false
}
