import fs from 'fs'
import path from 'path'
import type webpack from 'webpack'
import type { NextConfig } from 'next'

import { parseFile, getDefaultExport, hasStaticName, hasHOC } from './utils'
import { LoaderOptions } from './types'
import { I18nConfig } from '../'

export default function nextTranslate(nextConfig: NextConfig = {}): NextConfig {
  const test = /\.(tsx|ts|js|mjs|jsx)$/
  const basePath = pkgDir()

  // NEXT_TRANSLATE_PATH env is supported both relative and absolute path
  const translationDir = path.resolve(
    path.relative(basePath, process.env.NEXT_TRANSLATE_PATH || '.')
  )

  const nextConfigI18n = nextConfig.i18n || {}
  let {
    locales = [],
    defaultLocale = 'en',
    loader = true,
    pagesInDir,
    pages,
    logger,
    ...restI18n
  } = require(path.join(translationDir, 'i18n')) as I18nConfig

  let hasGetInitialPropsOnAppJs = false

  // https://github.com/blitz-js/blitz/blob/canary/nextjs/packages/next/build/utils.ts#L54-L59
  if (!pagesInDir) {
    pagesInDir = 'pages'
    if (fs.existsSync(path.join(basePath, 'src/pages'))) {
      pagesInDir = 'src/pages'
    } else if (fs.existsSync(path.join(basePath, 'app/pages'))) {
      pagesInDir = 'app/pages'
    } else if (fs.existsSync(path.join(basePath, 'integrations/pages'))) {
      pagesInDir = 'integrations/pages'
    }
  }

  const pagesPath = path.join(basePath, pagesInDir)
  const app = fs.readdirSync(pagesPath).find((page) => page.startsWith('_app.'))

  if (app) {
    const appPkg = parseFile(basePath, path.join(pagesPath, app))
    const defaultExport = getDefaultExport(appPkg)

    if (defaultExport) {
      const isGetInitialProps = hasStaticName(
        appPkg,
        defaultExport,
        'getInitialProps'
      )
      hasGetInitialPropsOnAppJs = isGetInitialProps || hasHOC(appPkg)
    }
  }

  return {
    ...nextConfig,
    i18n: {
      ...nextConfigI18n,
      ...restI18n,
      locales,
      defaultLocale,
    },
    webpack(conf: webpack.Configuration, options) {
      const config: webpack.Configuration =
        typeof nextConfig.webpack === 'function'
          ? nextConfig.webpack(conf, options)
          : conf

      // Creating some "slots" if they don't exist
      if (!config.resolve) config.resolve = {}
      if (!config.module) config.module = {}
      if (!config.module.rules) config.module.rules = []

      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        '@next-translate-root': path.resolve(translationDir),
      }

      // we give the opportunity for people to use next-translate without altering
      // any document, allowing them to manually add the necessary helpers on each
      // page to load the namespaces.
      if (!loader) return config

      config.module.rules.push({
        test,
        use: {
          loader: 'next-translate/plugin/loader',
          options: {
            basePath,
            pagesPath: path.join(pagesPath, '/'),
            hasAppJs: Boolean(app),
            hasGetInitialPropsOnAppJs,
            hasLoadLocaleFrom: typeof restI18n.loadLocaleFrom === 'function',
            extensionsRgx: restI18n.extensionsRgx || test,
            revalidate: restI18n.revalidate || 0,
          } as LoaderOptions,
        },
      })

      return config
    },
  }
}

function pkgDir() {
  try {
    return (require('pkg-dir').sync() as string) || process.cwd()
  } catch (e) {
    return process.cwd()
  }
}
