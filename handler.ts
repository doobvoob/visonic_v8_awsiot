import { IotData } from 'aws-sdk'
import * as alarm from '@chrisns/visonic_v8'

const iotdata = new IotData({
  endpoint: process.env.aws_iot_endpoint
})

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
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

interface change_state {
  set_state: string
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function change_state (event: change_state) {
  console.log(event, event.set_state)
  if (event.set_state === undefined) return
  const client = await authenticatedAxios()
  console.log(`authenticated session with ${process.env.hostname}`)
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

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function cron () {
  const client = await authenticatedAxios()
  console.log(`authenticated session with ${process.env.hostname}`)
  const status = await alarm.getStatus(client)
  console.log('fetched status', status)

  const mapped = {
    ...status,
    is_connected: status.connected,
    ready_status: status.partitions[0].ready, // true/false
    state: status.partitions[0].state // Disarm/ExitDelayHome/Home/ExitDelayAway/Away/unknown
  }
  if (mapped.state === 'HOME') mapped.state = 'Home'
  if (mapped.state === 'AWAY') mapped.state = 'Away'
  if (mapped.state === 'DISARM') mapped.state = 'Disarm'

  await iotdata
    .updateThingShadow({
      payload: JSON.stringify({ state: { reported: mapped } }),
      thingName: 'alarm_status'
    })
    .promise()

  const troubles = await alarm.getTroubles(client)
  console.log('fetched troubles', troubles)
  await iotdata
    .updateThingShadow({
      payload: JSON.stringify({ state: { reported: { troubles } } }),
      shadowName: 'troubles',
      thingName: 'alarm_status'
    })
    .promise()

  const alerts = await alarm.getAlerts(client)
  console.log('fetched alerts', alerts)
  await iotdata
    .updateThingShadow({
      payload: JSON.stringify({ state: { reported: { alerts } } }),
      shadowName: 'alerts',
      thingName: 'alarm_status'
    })
    .promise()

  const alarms = await alarm.getAlarms(client)
  console.log('fetched alarms', alarms)
  await iotdata
    .updateThingShadow({
      payload: JSON.stringify({ state: { reported: { alarms } } }),
      shadowName: 'alarms',
      thingName: 'alarm_status'
    })
    .promise()

  const devices = await alarm.getAllDevices(client)
  const mappedDevices = {}
  devices
    .filter(device => device.device_type === 'ZONE')
    .forEach(
      device =>
        (mappedDevices[`zone_${device.device_number}`] = {
          zone_type: device.zone_type,
          subtype: device.subtype,
          location: device.traits.location.name,
          rssi: device.traits.rssi,
          bypass: device.traits.bypass.enabled,
          open:
            device.warnings &&
            device.warnings.filter(warning => warning.type === 'OPENED')
              .length >= 1
              ? true
              : false
        })
    )

  console.log('fetched and mapped devices', mappedDevices)
  await iotdata
    .updateThingShadow({
      payload: JSON.stringify({ state: { reported: mappedDevices } }),
      shadowName: 'devices',
      thingName: 'alarm_status'
    })
    .promise()

  return 'OK'
}
