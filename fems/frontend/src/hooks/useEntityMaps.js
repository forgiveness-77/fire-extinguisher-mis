import { useState, useEffect } from 'react';
import { getExtinguishers, getUsers } from '../api';

/** Fetches ALL pages from a paginated API endpoint (limit capped at 100 server-side). */
async function fetchAllPages(apiFn, params = {}) {
  const PAGE_SIZE = 100;
  const first = await apiFn({ ...params, limit: PAGE_SIZE, page: 1 });
  const { data: firstData, pagination } = first.data;
  const all = [...(firstData || [])];

  if (pagination && pagination.total > PAGE_SIZE) {
    const totalPages = Math.ceil(pagination.total / PAGE_SIZE);
    const remaining = [];
    for (let p = 2; p <= totalPages; p++) {
      remaining.push(apiFn({ ...params, limit: PAGE_SIZE, page: p }));
    }
    const pages = await Promise.all(remaining);
    pages.forEach(r => { all.push(...(r.data.data || [])); });
  }
  return all;
}

/**
 * Fetches ALL extinguishers and users (when admin), returns lookup maps and lists.
 * Automatically paginates through all pages (server limit is 100 per page).
 * Maps: extMap[id] → { serialNumber, location, type, status }
 *       userMap[id] → "First Last"
 */
export function useEntityMaps(includeUsers = false) {
  const [extList,  setExtList]  = useState([]);
  const [extMap,   setExtMap]   = useState({});
  const [userList, setUserList] = useState([]);
  const [userMap,  setUserMap]  = useState({});
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const fetches = [
      fetchAllPages(getExtinguishers).then(list => {
        const map = {};
        list.forEach(e => { map[e.id] = { serialNumber: e.serialNumber, location: e.location, type: e.type, status: e.status }; });
        setExtList(list);
        setExtMap(map);
      }).catch(() => {}),
    ];

    if (includeUsers) {
      fetches.push(
        fetchAllPages(getUsers, { status: 'active' }).then(list => {
          const map = {};
          list.forEach(u => { map[u.id] = `${u.firstName} ${u.lastName}`; });
          setUserList(list);
          setUserMap(map);
        }).catch(() => {})
      );
    }

    Promise.all(fetches).finally(() => setLoading(false));
  }, [includeUsers]);

  const resolveExt  = (id) => extMap[id]  ? `${extMap[id].serialNumber} — ${extMap[id].location}` : id ? `${id.slice(0,8)}…` : '—';
  const resolveUser = (id) => userMap[id] ? userMap[id] : id ? `${id.slice(0,8)}…` : '—';

  return { extList, extMap, userList, userMap, loading, resolveExt, resolveUser };
}
