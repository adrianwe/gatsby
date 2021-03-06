const crypto = require(`crypto`)
const axios = require(`axios`)
const { createRemoteFileNode } = require(`gatsby-source-filesystem`)

const SCREENSHOT_ENDPOINT = `https://h7iqvn4842.execute-api.us-east-2.amazonaws.com/prod/screenshot`

const createContentDigest = obj =>
  crypto
    .createHash(`md5`)
    .update(JSON.stringify(obj))
    .digest(`hex`)

exports.onPreBootstrap = (
  { store, cache, actions, createNodeId, getNodes },
  pluginOptions
) => {
  const { createNode, touchNode } = actions
  const screenshotNodes = getNodes().filter(
    n => n.internal.type === `Screenshot`
  )

  // Check for updated screenshots
  // and prevent Gatsby from garbage collecting remote file nodes
  return Promise.all(
    screenshotNodes.map(async n => {
      if (n.expires && new Date() >= new Date(n.expires)) {
        // Screenshot expired, re-run Lambda
        await createScreenshotNode({
          url: n.url,
          parent: n.parent,
          store,
          cache,
          createNode,
          createNodeId,
        })
      } else {
        // Screenshot hasn't yet expired, touch the image node
        // to prevent garbage collection
        touchNode({ nodeId: n.screenshotFile___NODE })
      }
    })
  )
}

exports.onCreateNode = async ({
  node,
  actions,
  store,
  cache,
  createNodeId,
}) => {
  const { createNode, createParentChildLink } = actions

  // We only care about parsed sites.yaml files with a url field
  if (node.internal.type !== `SitesYaml` || !node.url) {
    return
  }

  const screenshotNode = await createScreenshotNode({
    url: node.url,
    parent: node.id,
    store,
    cache,
    createNode,
    createNodeId,
  })

  createParentChildLink({
    parent: node,
    child: screenshotNode,
  })
}

const createScreenshotNode = async ({
  url,
  parent,
  store,
  cache,
  createNode,
  createNodeId,
}) => {
  const screenshotResponse = await axios.post(SCREENSHOT_ENDPOINT, { url })

  const fileNode = await createRemoteFileNode({
    url: screenshotResponse.data.url,
    store,
    cache,
    createNode,
    createNodeId,
  })

  const screenshotNode = {
    id: `${parent} >>> Screenshot`,
    url,
    expires: screenshotResponse.data.expires,
    parent,
    children: [],
    internal: {
      type: `Screenshot`,
    },
    screenshotFile___NODE: fileNode.id,
  }

  screenshotNode.internal.contentDigest = createContentDigest(screenshotNode)

  createNode(screenshotNode)

  return screenshotNode
}
