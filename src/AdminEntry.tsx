import App from './App'
import CompanyGate from './CompanyGate'
import { companyManaged } from './company-config'

export default function AdminEntry() {
  return companyManaged ? <CompanyGate><App /></CompanyGate> : <App />
}
