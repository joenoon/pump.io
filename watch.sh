#!/usr/bin/env bash

coffee -l -w -o lib -c src &
pid1=$!
coffee -l -w -o example -c example &
pid2=$!
trap "echo killing $pid1 $pid2; kill $pid1 $pid2; exit 1" EXIT
wait
exit 0
