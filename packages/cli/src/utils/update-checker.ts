import { cyan, yellow } from 'colorette'
import updateNotifier from 'update-notifier'

/**
 * Check for updates asynchronously
 */
export function checkForUpdates(packageName: string, currentVersion: string): void {
  try {
    const notifier = updateNotifier({
      pkg: { name: packageName, version: currentVersion },
      updateCheckInterval: 1000 * 60 * 60 * 24, // 24 hours
      shouldNotifyInNpmScript: false,
    })

    if (notifier.update) {
      const { latest, current } = notifier.update
      console.log(`
${yellow('📦 Update available!')} ${current} → ${cyan(latest)}
Run ${cyan(`npm install -g ${packageName}`)} to update
      `)
    }
  } catch {
    // Silently ignore update check failures
  }
}
