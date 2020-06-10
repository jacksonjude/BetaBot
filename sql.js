const { Client } = require('pg')
const url = process.env.DATABASE_URL + "?ssl=true"
var connection
var disconnectTimer

exports.query = function(sql, values, callback)
{
  if (connection == null)
  {
    connection = new Client(url)
    connection.connect()
  }

  if (disconnectTimer != null)
  {
    clearTimeout(disconnectTimer)
  }

  connection.query(sql, values, function(err, results)
  {
    callback(err, results ? results : {"rows":null})

    if (err != null)
      console.log(sql, values/*, err.stack*/)

    clearTimeout(disconnectTimer)
    disconnectTimer = setTimeout(function()
    {
      connection.end()
      connection = null
    }, 10000)
  })
}
