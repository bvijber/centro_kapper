import { createFileRoute } from '@tanstack/react-router'
import { MyBookings } from '../../pages/MyBookings'
export const Route = createFileRoute('/_customer/bookings')({ component: MyBookings })
