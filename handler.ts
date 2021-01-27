import { IotData } from 'aws-sdk'
import * as alarm from '@chrisns/visonic_v8'

const iotdata = new IotData({
  endpoint: process.env.aws_iot_endpoint
})

export async function authenticatedAxios () {
  return alarm.getAuthenticatedAxios({
    hostname: process.env.hostname,
    app_id: process.env.app_id,
    user_code: process.env.user_code,
    user_token: null,
    panel_id: process.env.panel_id,
    email: process.env.email,
    password: process.env.password
  })
}

export async function change_state (event) {
  const client = await authenticatedAxios()
  if (event.set_state === undefined) return
  enum states {
    arm_home = 'HOME',
    disarm = 'DISARM',
    arm_away = 'AWAY'
  }
  await iotdata
    .updateThingShadow({
      payload: JSON.stringify({ state: { desired: null } }),
      thingName: 'alarm_status'
    })
    .promise()

  return alarm.setState(
    {
      partition: -1,
      state: states[event.set_state]
    },
    client
  )
}

export async function cron () {
  const client = await authenticatedAxios()
  const status = await alarm.getStatus(client)
  const mapped = {
    ...status,
    is_connected: status.connected,
    ready_status: status.partitions[0].ready, // true/false
    state: status.partitions[0].state // Disarm/ExitDelayHome/Home/ExitDelayAway/Away/unknown
  }
  return iotdata
    .updateThingShadow({
      payload: JSON.stringify({ state: { reported: mapped } }),
      thingName: 'alarm_status'
    })
    .promise()
}
