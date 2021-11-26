const pollsCollectionID = "pollConfigurations"

var pollsData = {}
var pollResponses = {}
var pollResponseReactionCollectors = {}
var pollsMessageIDs = {}

const catchAllFilter = () => true

export const interpretPollSetting = function(pollID, pollDataJSON)
{
  pollsData[pollID] = pollDataJSON
}

export const sendVoteCommand = async function(msg, messageContent)
{
  if (/^vote\s(.+)$/.test(messageContent))
  {
    await msg.member.fetch()

    var pollID = /^vote\s(.+)$/.exec(messageContent)[1]

    if (!(pollID in pollsData))
    {
      msg.channel.send("Invalid poll name: " + pollID)
      return false
    }

    var pollData = pollsData[pollID]

    var isWithinPollTimeRange = Date.now() >= pollData.openTime.toMillis() && Date.now() <= pollData.closeTime.toMillis()
    var inRequiredServer = pollData.serverID ? msg.channel.guildId == pollData.serverID : true
    var hasRequiredRoles = pollData.roleName ? msg.member.roles.cache.find(role => role.name == pollData.roleName) : true

    if (!isWithinPollTimeRange)
    {
      msg.channel.send(pollData.name + " has " + (Date.now() < pollData.openTime.toMillis() ? "not opened" : "closed"))
      return false
    }
    if (!inRequiredServer)
    {
      msg.channel.send("Cannot vote on " + pollData.name + " in this server")
      return false
    }
    if (!hasRequiredRoles)
    {
      msg.channel.send("Cannot vote on " + pollData.name + " without the " + pollData.roleName + " role")
      return false
    }

    console.log("Init vote " + pollID + " in " + msg.guild.name)

    return pollID
  }

  return false
}

export const sendVoteDM = async function(client, user, pollID, uploadPollResponse, previousPollResponseMessageIDs)
{
  var dmChannel = user.dmChannel || await user.createDM()

  var pollData = pollsData[pollID]
  var pollMessageIDs = {}

  var titleMessage = await dmChannel.send("__**" + pollData.name + "**__")
  pollMessageIDs["title"] = titleMessage.id

  for (let questionData of pollData.questions)
  {
    let questionString = "**" + questionData.prompt + "**"
    for (let optionData of questionData.options)
    {
      questionString += "\n" + ":" + optionData.emote + ": \\: " + optionData.name
    }

    let questionMessage = await dmChannel.send(questionString)
    pollMessageIDs[questionData.id] = questionMessage.id

    let questionReactionCollector = questionMessage.createReactionCollector({ catchAllFilter, dispose: true })
    questionReactionCollector.on('collect', async (reaction, user) => {
      if (user.id == client.user.id) { return }
      await user.fetch()

      let { currentPollID, currentQuestionID, currentOptionData } = getCurrentOptionDataFromReaction(reaction, user)
      if (!currentOptionData)
      {
        // await reaction.users.remove(user.id)
        return
      }

      let currentOptionID = currentOptionData.id

      if (!(currentPollID in pollResponses))
      {
        pollResponses[currentPollID] = {}
      }
      if (!(user.id in pollResponses[currentPollID]))
      {
        pollResponses[currentPollID][user.id] = {}
      }
      pollResponses[currentPollID][user.id][currentQuestionID] = currentOptionID

      // await reaction.message.reactions.fetch()
      //
      // for (let otherReaction in reaction.message.reactions)
      // {
      //   if (otherReaction.emoji.name == reaction.emoji.name) { return }
      //
      //   await otherReaction.users.fetch()
      //   if (otherReaction.users.cache.has(user.id))
      //   {
      //     otherReaction.users.remove(user.id)
      //   }
      // }
    })
    questionReactionCollector.on('remove', async (reaction, user) => {
      if (user.id == client.user.id) { return }
      await user.fetch()

      let { currentPollID, currentQuestionID, currentOptionData } = getCurrentOptionDataFromReaction(reaction, user)
      if (!currentOptionData) { return }

      let currentOptionID = currentOptionData.id

      if (!(currentPollID in pollResponses))
      {
        pollResponses[currentPollID] = {}
      }
      if (!(user.id in pollResponses[currentPollID]))
      {
        pollResponses[currentPollID][user.id] = {}
      }
      if (pollResponses[currentPollID][user.id][currentQuestionID] == currentOptionID)
      {
        delete pollResponses[currentPollID][user.id][currentQuestionID]
      }
    })

    if (!(pollID in pollResponseReactionCollectors))
    {
      pollResponseReactionCollectors[pollID] = {}
    }
    if (!(user.id in pollResponseReactionCollectors[pollID]))
    {
      pollResponseReactionCollectors[pollID][user.id] = []
    }

    pollResponseReactionCollectors[pollID][user.id].push(questionReactionCollector)

    for (let optionData of questionData.options)
    {
      let emoteID = getEmoteID(client, optionData.emote)
      if (emoteID == null) { continue }
      await questionMessage.react(emoteID)
    }
  }

  var submitMessage = await dmChannel.send("**" + ":arrow_down: Submit below :arrow_down:" + "**")
  pollMessageIDs["submit"] = submitMessage.id

  var submitReactionCollector = submitMessage.createReactionCollector({ catchAllFilter })
  submitReactionCollector.on('collect', async (reaction, user) => {
    if (user.id == client.user.id) { return }
    if (emojiConverter.unemojify(reaction.emoji.name).replace(/:/g, '') != "white_check_mark") { return }

    await user.fetch()

    let { currentPollID } = getCurrentPollQuestionIDFromMessageID(reaction.message.id, user.id)
    if (pollResponses[currentPollID] == null || pollResponses[currentPollID][user.id] == null) { return }

    await uploadPollResponse(currentPollID, user.id, pollResponses[currentPollID][user.id])

    for (let reactionCollector of pollResponseReactionCollectors[currentPollID][user.id])
    {
      reactionCollector.stop()
    }
    delete pollResponseReactionCollectors[currentPollID][user.id]

    if (!(currentPollID in pollsMessageIDs && user.id in pollsMessageIDs[currentPollID])) { return }

    for (let questionKey of Object.keys(pollsMessageIDs[currentPollID][user.id]))
    {
      if (questionKey == "submit")
      {
        let message = await user.dmChannel.messages.fetch(pollsMessageIDs[currentPollID][user.id][questionKey])
        await message.edit(":white_check_mark: Submitted " + pollsData[pollID].name)
      }
      else
      {
        await user.dmChannel.messages.delete(pollsMessageIDs[currentPollID][user.id][questionKey])
      }
    }
  })

  pollResponseReactionCollectors[pollID][user.id].push(submitReactionCollector)

  var submitEmoteID = getEmoteID(client, "white_check_mark")
  await submitMessage.react(submitEmoteID)

  if (previousPollResponseMessageIDs)
  {
    for (let previousPollResponseMessageID of Object.values(previousPollResponseMessageIDs))
    {
      try
      {
        await user.dmChannel.messages.delete(previousPollResponseMessageID)
      }
      catch {}
    }
  }

  if (!(pollID in pollsMessageIDs))
  {
    pollsMessageIDs[pollID] = {}
  }
  pollsMessageIDs[pollID][user.id] = pollMessageIDs

  return pollMessageIDs
}

function getCurrentPollQuestionIDFromMessageID(messageID, userID)
{
  var currentQuestionID
  var currentPollID = Object.keys(pollsMessageIDs).find((pollID) => {
    if (pollsMessageIDs[pollID][userID])
    {
      let questionID = Object.keys(pollsMessageIDs[pollID][userID]).find((questionID) => pollsMessageIDs[pollID][userID][questionID] == messageID)
      if (questionID)
      {
        currentQuestionID = questionID
        return true
      }
    }
    return false
  })

  return { currentQuestionID: currentQuestionID, currentPollID: currentPollID }
}

function getCurrentOptionDataFromReaction(reaction, user)
{
  var emoteName = emojiConverter.unemojify(reaction.emoji.name).replace(/:/g, '')

  var { currentPollID, currentQuestionID } = getCurrentPollQuestionIDFromMessageID(reaction.message.id, user.id)
  var currentQuestionData = pollsData[currentPollID].questions.find(questionData => questionData.id == currentQuestionID)
  var currentOptionData = currentQuestionData.options.find(optionData => optionData.emote == emoteName)

  return { currentPollID: currentPollID, currentQuestionID: currentQuestionID, currentOptionData: currentOptionData }
}

import emojiConverter from 'node-emoji'

function getEmoteID(client, emoteName)
{
  var emote = client.emojis.cache.find(emoji => emoji.name == emoteName)
  if (emote != null)
  {
    return emote.id
  }

  emote = emojiConverter.get(":" + emoteName + ":")
  if (emote != null && !emote.includes(":"))
  {
    return emote
  }

  return null
}
