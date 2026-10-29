import { useRoute } from '@/veltrio/router'
import { TxWatcher } from '@/veltrio/TxWatcher'
import { Shell } from '@/components/Shell'
import { Dashboard } from '@/pages/Dashboard'
import { Send } from '@/pages/Send'
import { Receive } from '@/pages/Receive'
import { Transactions } from '@/pages/Transactions'
import { Activity } from '@/pages/Activity'
import { SavedAddresses } from '@/pages/SavedAddresses'
import { Receipt } from '@/pages/Receipt'

function Page() {
  const route = useRoute()
  switch (route.name) {
    case 'send':
      return <Send />
    case 'receive':
      return <Receive />
    case 'transactions':
      return <Transactions />
    case 'activity':
      return <Activity />
    case 'saved':
      return <SavedAddresses />
    case 'tx':
      return <Receipt hash={route.hash} />
    default:
      return <Dashboard />
  }
}

export default function App() {
  return (
    <>
      <TxWatcher />
      <Shell>
        <Page />
      </Shell>
    </>
  )
}
