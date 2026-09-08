import { createServerFn } from '@tanstack/react-start'

import { getHomeData } from './home.service.server'

export const getHomeDataFn = createServerFn({ method: 'GET' }).handler(() => getHomeData())